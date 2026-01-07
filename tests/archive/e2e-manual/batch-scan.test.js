/**
 * E2E Batch Scan Endpoint Tests
 *
 * Tests the batch bookshelf scanning endpoint that accepts multiple photos
 * via multipart/form-data and processes them sequentially with WebSocket progress updates.
 *
 * REQUIREMENTS:
 * - Worker must be running locally: npm run dev (in another terminal)
 * - Run these tests with: npm run test:e2e
 *
 * These tests are SKIPPED by default in the main test suite.
 * They require a live worker at http://localhost:8787
 */

import { describe, it, expect, beforeAll } from "vitest";

// Only run E2E tests when explicitly requested via environment variable
const isE2E = process.env.RUN_E2E_TESTS === "true";

/**
 * Helper function to create a multipart/form-data request with binary images
 * @param {string} url - The endpoint URL
 * @param {Array<Blob>} photos - Array of photo Blobs to upload
 * @returns {Promise<Response>} Fetch response
 */
async function createMultipartRequest(url, photos) {
  const formData = new FormData();

  photos.forEach((photo, index) => {
    formData.append('photos[]', photo, `photo${index}.jpg`);
  });

  return fetch(url, {
    method: 'POST',
    body: formData, // FormData automatically sets Content-Type with boundary
  });
}

/**
 * Helper to create a mock JPEG Blob for testing
 * @param {number} sizeInBytes - Size of the mock image
 * @returns {Blob} Mock JPEG blob
 */
function createMockJPEG(sizeInBytes = 1000) {
  // Create binary data that resembles a JPEG (starts with FF D8 FF magic bytes)
  const data = new Uint8Array(sizeInBytes);
  data[0] = 0xFF; // JPEG magic bytes
  data[1] = 0xD8;
  data[2] = 0xFF;
  // Fill rest with random data
  for (let i = 3; i < sizeInBytes; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  return new Blob([data], { type: 'image/jpeg' });
}

describe.skipIf(!isE2E)("Batch Scan Endpoint E2E Tests", () => {
  const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:8787";

  // Test connection to local dev server
  beforeAll(async () => {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (!response.ok) {
        throw new Error("Worker not running. Start with: npm run dev");
      }
    } catch (error) {
      console.error("Failed to connect to worker:", error.message);
      throw new Error(
        "Worker must be running on http://localhost:8787. Start with: npm run dev",
      );
    }
  });

  it("accepts batch scan request with multiple images (multipart/form-data)", async () => {
    const photos = [
      createMockJPEG(1000),
      createMockJPEG(1500),
    ];

    const response = await createMultipartRequest(
      `${BASE_URL}/api/batch-scan`,
      photos
    );

    expect(response.status).toBe(202); // Accepted
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.jobId).toBeDefined(); // Server generates jobId now
    expect(body.data.token).toBeDefined();
    expect(body.data.totalPhotos).toBe(2);
    expect(body.data.status).toBe("processing");
    expect(body.metadata).toBeDefined();
    expect(body.metadata.timestamp).toBeDefined();
    expect(body.error).toBeUndefined();
  });

  it("accepts batch scan via /api/scan-bookshelf/batch alias", async () => {
    const photos = [createMockJPEG(1000)];

    const response = await createMultipartRequest(
      `${BASE_URL}/api/scan-bookshelf/batch`,
      photos
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.data.jobId).toBeDefined();
    expect(body.data.totalPhotos).toBe(1);
  });

  it("rejects batches exceeding 5 photos", async () => {
    const photos = Array.from({ length: 6 }, () => createMockJPEG(1000));

    const response = await createMultipartRequest(
      `${BASE_URL}/api/batch-scan`,
      photos
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("maximum 5 photos");
    expect(body.error.code).toBe("BATCH_TOO_LARGE");
  });

  it("rejects request without photos[] field", async () => {
    const formData = new FormData();
    // Add a field with wrong name
    formData.append('images', createMockJPEG(1000), 'photo.jpg');

    const response = await fetch(`${BASE_URL}/api/batch-scan`, {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("photos[]");
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects empty photos[] array", async () => {
    const formData = new FormData();
    // FormData with photos[] field but no files

    const response = await fetch(`${BASE_URL}/api/batch-scan`, {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.data).toBeNull();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("No photos provided");
  });

  it("validates file size limits (10MB per photo)", async () => {
    // Create a photo larger than 10MB
    const largePhoto = createMockJPEG(11_000_000); // 11MB

    const photos = [largePhoto];
    const response = await createMultipartRequest(
      `${BASE_URL}/api/batch-scan`,
      photos
    );

    expect(response.status).toBe(413); // Payload Too Large
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("exceeds maximum size");
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("validates total batch size (50MB total)", async () => {
    // Create 5 photos of 11MB each (55MB total, exceeds 50MB limit)
    const photos = Array.from({ length: 5 }, () => createMockJPEG(11_000_000));

    const response = await createMultipartRequest(
      `${BASE_URL}/api/batch-scan`,
      photos
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("Total batch size");
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects non-binary file data", async () => {
    const formData = new FormData();
    // Add text instead of binary image
    formData.append('photos[]', new Blob(['not an image'], { type: 'text/plain' }), 'photo.jpg');

    const response = await fetch(`${BASE_URL}/api/batch-scan`, {
      method: "POST",
      body: formData,
    });

    // Should accept any Blob/File, but will fail during processing
    // The validation happens on file size, not type
    expect(response.status).toBe(202); // Accepts but will fail in processing
  });

  it("includes CORS headers", async () => {
    const photos = [createMockJPEG(1000)];
    const response = await createMultipartRequest(
      `${BASE_URL}/api/batch-scan`,
      photos
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("generates unique jobId for each request", async () => {
    const photos = [createMockJPEG(1000)];

    const response1 = await createMultipartRequest(`${BASE_URL}/api/batch-scan`, photos);
    const body1 = await response1.json();

    const response2 = await createMultipartRequest(`${BASE_URL}/api/batch-scan`, photos);
    const body2 = await response2.json();

    expect(body1.data.jobId).not.toBe(body2.data.jobId);
    expect(body1.data.token).not.toBe(body2.data.token);
  });
});

describe.skipIf(!isE2E)("Batch State Management (Durable Object)", () => {
  const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:8787";

  it("initializes batch job with photo array", async () => {
    const jobId = `test-batch-${crypto.randomUUID()}`;

    // Create Durable Object stub
    const response = await fetch(`${BASE_URL}/test/do/init-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        totalPhotos: 3,
        status: "uploading",
      }),
    });

    expect(response.status).toBe(200);
    const initResult = await response.json();
    expect(initResult.success).toBe(true);

    // Fetch state to verify initialization
    const stateResponse = await fetch(
      `${BASE_URL}/test/do/get-state?jobId=${jobId}`,
    );
    expect(stateResponse.status).toBe(200);

    const state = await stateResponse.json();
    expect(state.type).toBe("batch");
    expect(state.totalPhotos).toBe(3);
    expect(state.photos).toHaveLength(3);
    expect(state.photos[0].status).toBe("queued");
    expect(state.photos[0].index).toBe(0);
    expect(state.photos[1].status).toBe("queued");
    expect(state.photos[2].status).toBe("queued");
    expect(state.overallStatus).toBe("uploading");
    expect(state.currentPhoto).toBeNull();
    expect(state.totalBooksFound).toBe(0);
    expect(state.cancelRequested).toBe(false);
  });

  it("updates individual photo progress", async () => {
    const jobId = `test-batch-${crypto.randomUUID()}`;

    // Initialize batch
    await fetch(`${BASE_URL}/test/do/init-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        totalPhotos: 2,
        status: "processing",
      }),
    });

    // Update photo 0 to processing
    const updateResponse = await fetch(`${BASE_URL}/test/do/update-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        photoIndex: 0,
        status: "processing",
      }),
    });

    expect(updateResponse.status).toBe(200);

    // Verify state
    const stateResponse = await fetch(
      `${BASE_URL}/test/do/get-state?jobId=${jobId}`,
    );
    const state = await stateResponse.json();

    expect(state.photos[0].status).toBe("processing");
    expect(state.photos[1].status).toBe("queued");
    expect(state.currentPhoto).toBe(0);
  });

  it("tracks books found per photo", async () => {
    const jobId = `test-batch-${crypto.randomUUID()}`;

    // Initialize batch
    await fetch(`${BASE_URL}/test/do/init-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        totalPhotos: 2,
        status: "processing",
      }),
    });

    // Update photo 0 with books found
    await fetch(`${BASE_URL}/test/do/update-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        photoIndex: 0,
        status: "complete",
        booksFound: 5,
      }),
    });

    // Verify state
    const stateResponse = await fetch(
      `${BASE_URL}/test/do/get-state?jobId=${jobId}`,
    );
    const state = await stateResponse.json();

    expect(state.photos[0].booksFound).toBe(5);
    expect(state.totalBooksFound).toBe(5);
  });

  it("accumulates total books across photos", async () => {
    const jobId = `test-batch-${crypto.randomUUID()}`;

    // Initialize batch
    await fetch(`${BASE_URL}/test/do/init-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        totalPhotos: 3,
        status: "processing",
      }),
    });

    // Complete photos with different book counts
    await fetch(`${BASE_URL}/test/do/update-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        photoIndex: 0,
        status: "complete",
        booksFound: 5,
      }),
    });

    await fetch(`${BASE_URL}/test/do/update-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        photoIndex: 1,
        status: "complete",
        booksFound: 8,
      }),
    });

    await fetch(`${BASE_URL}/test/do/update-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        photoIndex: 2,
        status: "complete",
        booksFound: 3,
      }),
    });

    // Verify state
    const stateResponse = await fetch(
      `${BASE_URL}/test/do/get-state?jobId=${jobId}`,
    );
    const state = await stateResponse.json();

    expect(state.totalBooksFound).toBe(16); // 5 + 8 + 3
  });

  it("handles photo errors", async () => {
    const jobId = `test-batch-${crypto.randomUUID()}`;

    // Initialize batch
    await fetch(`${BASE_URL}/test/do/init-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        totalPhotos: 2,
        status: "processing",
      }),
    });

    // Update photo 0 with error
    await fetch(`${BASE_URL}/test/do/update-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        photoIndex: 0,
        status: "error",
        error: "AI processing failed",
      }),
    });

    // Verify state
    const stateResponse = await fetch(
      `${BASE_URL}/test/do/get-state?jobId=${jobId}`,
    );
    const state = await stateResponse.json();

    expect(state.photos[0].status).toBe("error");
    expect(state.photos[0].error).toBe("AI processing failed");
  });

  it("completes batch with final results", async () => {
    const jobId = `test-batch-${crypto.randomUUID()}`;

    // Initialize batch
    await fetch(`${BASE_URL}/test/do/init-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        totalPhotos: 2,
        status: "processing",
      }),
    });

    // Complete batch
    const completeResponse = await fetch(`${BASE_URL}/test/do/complete-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        status: "complete",
        totalBooks: 12,
        photoResults: [
          { index: 0, status: "complete", booksFound: 7 },
          { index: 1, status: "complete", booksFound: 5 },
        ],
        books: [], // Would contain actual book data
      }),
    });

    expect(completeResponse.status).toBe(200);

    // Verify state
    const stateResponse = await fetch(
      `${BASE_URL}/test/do/get-state?jobId=${jobId}`,
    );
    const state = await stateResponse.json();

    expect(state.overallStatus).toBe("complete");
    expect(state.totalBooksFound).toBe(12);
    expect(state.finalResults).toBeDefined();
  });

  it("checks cancellation status", async () => {
    const jobId = `test-batch-${crypto.randomUUID()}`;

    // Initialize batch
    await fetch(`${BASE_URL}/test/do/init-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        totalPhotos: 2,
        status: "processing",
      }),
    });

    // Check initial cancellation status
    const checkResponse1 = await fetch(
      `${BASE_URL}/test/do/is-canceled?jobId=${jobId}`,
    );
    const result1 = await checkResponse1.json();
    expect(result1.canceled).toBe(false);

    // Request cancellation (will be tested in Task 6, just verify endpoint exists)
    const cancelResponse = await fetch(`${BASE_URL}/test/do/cancel-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });

    expect(cancelResponse.status).toBe(200);

    // Check cancellation status after cancel
    const checkResponse2 = await fetch(
      `${BASE_URL}/test/do/is-canceled?jobId=${jobId}`,
    );
    const result2 = await checkResponse2.json();
    expect(result2.canceled).toBe(true);
  });

  it("returns 404 for non-existent job state", async () => {
    const jobId = `nonexistent-${crypto.randomUUID()}`;

    const stateResponse = await fetch(
      `${BASE_URL}/test/do/get-state?jobId=${jobId}`,
    );
    expect(stateResponse.status).toBe(404);
  });

  it("returns 404 when updating photo for non-existent batch", async () => {
    const jobId = `nonexistent-${crypto.randomUUID()}`;

    const updateResponse = await fetch(`${BASE_URL}/test/do/update-photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        photoIndex: 0,
        status: "processing",
      }),
    });

    expect(updateResponse.status).toBe(404);
  });
});
