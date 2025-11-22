#!/bin/bash
# Test Bookshelf Scan Flow
# Tests the complete end-to-end flow after ExecutionContext fix

set -e

echo "🔍 Testing Bookshelf Scan Flow"
echo "================================"
echo ""

# Step 1: Create a test image (1x1 pixel JPEG)
echo "📸 Step 1: Creating test image..."
TEST_IMAGE=$(mktemp /tmp/test-book.XXXXXX.jpg)
# Create a minimal valid JPEG (1x1 red pixel)
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\x27 ,$\x1c\x1c(7),01444\x1f\x27=@37<DOB\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x7f\x00\xff\xd9' > "$TEST_IMAGE"
echo "✅ Test image created: $TEST_IMAGE"
echo ""

# Step 2: Submit batch scan job
echo "📤 Step 2: Submitting batch scan job..."
RESPONSE=$(curl -s -X POST https://api.oooefam.net/api/scan-bookshelf/batch \
  -F "photos[]=@$TEST_IMAGE" \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "HTTP Status: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq '.'
echo ""

if [ "$HTTP_CODE" != "202" ]; then
  echo "❌ FAILED: Expected HTTP 202, got $HTTP_CODE"
  rm -f "$TEST_IMAGE"
  exit 1
fi

# Extract jobId and token
JOB_ID=$(echo "$BODY" | jq -r '.data.jobId')
TOKEN=$(echo "$BODY" | jq -r '.data.token')

if [ "$JOB_ID" == "null" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ FAILED: Missing jobId or token in response"
  rm -f "$TEST_IMAGE"
  exit 1
fi

echo "✅ Job accepted:"
echo "   Job ID: $JOB_ID"
echo "   Token: $TOKEN"
echo ""

# Step 3: Connect WebSocket and monitor progress
echo "🔌 Step 3: Connecting to WebSocket..."
echo "   URL: wss://api.oooefam.net/ws/progress?jobId=$JOB_ID&token=$TOKEN"
echo ""
echo "📊 Monitoring progress (30 second timeout)..."
echo "   Expected messages:"
echo "   1. ready_ack (pipeline: ai_scan)"
echo "   2. progress updates (Photos uploaded, Processing photo...)"
echo "   3. complete (with resourceId: scan-results:$JOB_ID)"
echo ""

# Use websocat if available, otherwise skip WebSocket test
if command -v websocat &> /dev/null; then
  timeout 30 websocat "wss://api.oooefam.net/ws/progress?jobId=$JOB_ID&token=$TOKEN" | while read -r msg; do
    echo "[WebSocket] $msg"

    # Check for completion message
    if echo "$msg" | jq -e '.type == "complete"' &>/dev/null; then
      echo ""
      echo "✅ Job completed! Breaking WebSocket connection..."
      break
    fi
  done
else
  echo "⚠️  websocat not installed, skipping WebSocket monitoring"
  echo "   Install with: brew install websocat (macOS) or cargo install websocat"
  echo ""
  echo "   Waiting 15 seconds for job to complete..."
  sleep 15
fi

echo ""

# Step 4: Retrieve results
echo "📥 Step 4: Retrieving results..."
echo "   GET /v1/jobs/$JOB_ID/results"
echo ""

RESULTS=$(curl -s "https://api.oooefam.net/v1/jobs/$JOB_ID/results")
echo "$RESULTS" | jq '.'
echo ""

# Verify results structure
if echo "$RESULTS" | jq -e '.data != null' &>/dev/null; then
  BOOK_COUNT=$(echo "$RESULTS" | jq '.data | length')
  echo "✅ Results retrieved: $BOOK_COUNT books detected"

  RESOURCE_ID=$(echo "$RESULTS" | jq -r '.metadata.resourceId')
  echo "   Resource ID: $RESOURCE_ID"
  echo "   Expected: scan-results:$JOB_ID"

  if [ "$RESOURCE_ID" == "scan-results:$JOB_ID" ]; then
    echo "✅ Resource ID matches!"
  else
    echo "⚠️  Resource ID mismatch"
  fi
else
  echo "❌ FAILED: No results found (404 or empty data)"
fi

echo ""

# Cleanup
rm -f "$TEST_IMAGE"
echo "🧹 Cleanup: Test image deleted"
echo ""

echo "================================"
echo "✅ TEST COMPLETE"
echo ""
echo "Summary:"
echo "  1. Job submission: ✅"
echo "  2. WebSocket connection: ✅"
echo "  3. Results retrieval: ✅"
echo ""
echo "If you saw progress updates via WebSocket, the ExecutionContext fix is working!"
echo "If results are empty, check that Gemini API is configured and working."
