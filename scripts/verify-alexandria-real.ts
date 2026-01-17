
import { createAlexandriaClient } from '../src/services/alexandria-client.js'

async function runVerification() {
  console.log('🔍 Starting Real Alexandria Verification...')
  
  const ALEXANDRIA_URL = 'https://alexandria.ooheynerds.com'
  console.log(`🌐 Target URL: ${ALEXANDRIA_URL}`)

  // 1. Raw Fetch Test (Health/Root)
  try {
    console.log('\n--- Test 1: Raw Fetch (Root) ---')
    const res = await fetch(ALEXANDRIA_URL)
    console.log(`Status: ${res.status} ${res.statusText}`)
    if (res.ok) {
        const text = await res.text()
        console.log(`Response: ${text.slice(0, 100)}...`)
    }
  } catch (error) {
    console.error('❌ Raw fetch failed:', error)
  }

  // 2. Raw Fetch Test (Search Title)
  try {
    console.log('\n--- Test 2: Raw Fetch (Search Title: The Great Gatsby) ---')
    // Note: Assuming /api/search exists and accepts query params
    const searchUrl = `${ALEXANDRIA_URL}/api/search?title=${encodeURIComponent('The Great Gatsby')}`
    const res = await fetch(searchUrl)
    console.log(`Status: ${res.status} ${res.statusText}`)
    if (res.ok) {
        const json = await res.json()
        console.log('Response:', JSON.stringify(json, null, 2))
    } else {
        console.log('Response:', await res.text())
    }
  } catch (error) {
    console.error('❌ Search fetch failed:', error)
  }

  // 3. Client Test (Title)
  try {
    console.log('\n--- Test 3: Alexandria Client Usage (Title) ---')
    const env = { 
        ALEXANDRIA_BASE_URL: ALEXANDRIA_URL,
        // Mocking secrets as undefined to test public access or if secrets are needed
    }
    const client = createAlexandriaClient(env as any)
    
    // Testing title search
    const res = await client.api.search.$get({
        query: { title: 'The Great Gatsby' }
    })
    console.log(`Client Status: ${res.status}`)
    if (res.ok) {
        const json = await res.json()
        console.log('Client Response:', JSON.stringify(json, null, 2))
    } else {
        console.error('Client request failed')
    }

  } catch (error) {
    console.error('❌ Client test failed:', error)
  }
}

runVerification()
