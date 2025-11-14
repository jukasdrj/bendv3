/**
 * MSW Handlers for Google Gemini API
 *
 * Mocks the Gemini 2.0 Flash API for testing without hitting real endpoints
 * Prevents token usage costs and ensures deterministic test results
 */

import { http, HttpResponse } from 'msw'

/**
 * Mock response for a successful bookshelf scan
 */
const mockBookshelfScanResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify([
              {
                title: 'The Pragmatic Programmer',
                authors: ['David Thomas', 'Andrew Hunt'],
                isbn: '9780135957059'
              },
              {
                title: 'Clean Code',
                authors: ['Robert C. Martin'],
                isbn: '9780132350884'
              },
              {
                title: 'Design Patterns',
                authors: ['Erich Gamma', 'Richard Helm', 'Ralph Johnson', 'John Vlissides'],
                isbn: '9780201633610'
              }
            ])
          }
        ],
        role: 'model'
      },
      finishReason: 'STOP',
      index: 0,
      safetyRatings: [
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          probability: 'NEGLIGIBLE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          probability: 'NEGLIGIBLE'
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          probability: 'NEGLIGIBLE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          probability: 'NEGLIGIBLE'
        }
      ]
    }
  ],
  usageMetadata: {
    promptTokenCount: 4128,
    candidatesTokenCount: 258,
    totalTokenCount: 4386
  }
}

/**
 * Mock response for CSV parsing
 */
const mockCSVParseResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              books: [
                {
                  title: 'Example Book',
                  authors: ['John Doe'],
                  isbn: '9781234567890'
                }
              ],
              totalRows: 1,
              validRows: 1,
              invalidRows: 0
            })
          }
        ],
        role: 'model'
      },
      finishReason: 'STOP',
      index: 0
    }
  ],
  usageMetadata: {
    promptTokenCount: 150,
    candidatesTokenCount: 50,
    totalTokenCount: 200
  }
}

/**
 * Gemini API Handlers
 */
export const geminiHandlers = [
  // Generate content - bookshelf scanning
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', async ({ request }) => {
    const body = await request.json()

    // Check if this is a bookshelf scan (has image data)
    const hasImage = body.contents?.some(content =>
      content.parts?.some(part => part.inlineData || part.fileData)
    )

    if (hasImage) {
      return HttpResponse.json(mockBookshelfScanResponse)
    }

    // Default to CSV parsing response
    return HttpResponse.json(mockCSVParseResponse)
  }),

  // Simulate empty response (no books found)
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent-empty', () => {
    return HttpResponse.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '[]'
              }
            ],
            role: 'model'
          },
          finishReason: 'STOP',
          index: 0
        }
      ],
      usageMetadata: {
        promptTokenCount: 4128,
        candidatesTokenCount: 0,
        totalTokenCount: 4128
      }
    })
  }),

  // Simulate rate limit error (429)
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent-rate-limit', () => {
    return new HttpResponse(JSON.stringify({
      error: {
        code: 429,
        message: 'Resource exhausted. Too many requests.',
        status: 'RESOURCE_EXHAUSTED'
      }
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60'
      }
    })
  }),

  // Simulate API key error (401)
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent-unauthorized', () => {
    return new HttpResponse(JSON.stringify({
      error: {
        code: 401,
        message: 'API key not valid.',
        status: 'UNAUTHENTICATED'
      }
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }),

  // Simulate timeout (30s+)
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent-timeout', async () => {
    await new Promise(resolve => setTimeout(resolve, 30000))
    return HttpResponse.json(mockBookshelfScanResponse)
  }),

  // Simulate safety block
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent-safety-block', () => {
    return HttpResponse.json({
      candidates: [
        {
          finishReason: 'SAFETY',
          index: 0,
          safetyRatings: [
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              probability: 'HIGH'
            }
          ]
        }
      ],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 0,
        totalTokenCount: 100
      }
    })
  })
]

/**
 * Create a custom Gemini response
 * Useful for testing specific scenarios
 */
export function createGeminiResponse(books, tokenCounts = {}) {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify(books)
            }
          ],
          role: 'model'
        },
        finishReason: 'STOP',
        index: 0
      }
    ],
    usageMetadata: {
      promptTokenCount: tokenCounts.prompt || 4128,
      candidatesTokenCount: tokenCounts.output || 258,
      totalTokenCount: (tokenCounts.prompt || 4128) + (tokenCounts.output || 258)
    }
  }
}

/**
 * Create a custom Gemini handler
 * For one-off test cases that need specific responses
 */
export function createGeminiHandler(endpoint, response) {
  return http.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:${endpoint}`, () => {
    return HttpResponse.json(response)
  })
}
