#!/usr/bin/env node

/**
 * Test script for enrichment WebSocket flow
 *
 * Tests Task 6: Enrichment service integration with ProgressWebSocketDO
 */

import WebSocket from 'ws';

const jobId = `test-enrich-${Date.now()}`;
const workIds = ['9780743273565', '9780141439518', 'Pride and Prejudice'];

console.log(`\n🧪 Testing Enrichment Flow`);
console.log(`Job ID: ${jobId}`);
console.log(`Work IDs: ${workIds.join(', ')}\n`);

// Step 1: Connect to WebSocket
console.log(`📡 Step 1: Connecting to WebSocket...`);
const ws = new WebSocket(`ws://localhost:8787/ws/progress?jobId=${jobId}`);

let progressUpdates = [];

ws.on('open', async () => {
  console.log(`✅ WebSocket connected\n`);

  // Step 2: Start enrichment job
  console.log(`🚀 Step 2: Starting enrichment job...`);

  try {
    const response = await fetch('http://localhost:8787/api/enrichment/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobId,
        workIds
      })
    });

    const data = await response.json();
    console.log(`✅ Enrichment started:`, data);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Expected: 202 Accepted\n`);

    if (response.status !== 202) {
      console.error(`❌ ERROR: Expected 202, got ${response.status}`);
      ws.close();
      process.exit(1);
    }

  } catch (error) {
    console.error(`❌ Failed to start enrichment:`, error);
    ws.close();
    process.exit(1);
  }
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  progressUpdates.push(message);

  // Extract actual progress data from wrapper
  const progressData = message.data || message;

  console.log(`📨 Progress update #${progressUpdates.length}:`);
  console.log(`   Type: ${message.type || 'unknown'}`);
  console.log(`   Progress: ${progressData.progress !== undefined ? (progressData.progress * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`   Status: ${progressData.currentStatus || 'N/A'}`);
  if (progressData.processedItems !== undefined) {
    console.log(`   Processed: ${progressData.processedItems}/${progressData.totalItems}`);
  }
  if (progressData.currentWorkId) {
    console.log(`   Current Work: ${progressData.currentWorkId}`);
  }
  if (progressData.error) {
    console.log(`   ⚠️  Error: ${progressData.error}`);
  }
  if (progressData.result) {
    console.log(`   📊 Final Result:`, JSON.stringify(progressData.result, null, 2));
  }
  console.log('');
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 WebSocket closed: ${code} - ${reason || 'No reason'}\n`);

  // Verify results
  console.log(`📊 Test Results:`);
  console.log(`   Total progress updates: ${progressUpdates.length}`);
  console.log(`   Expected: At least ${workIds.length + 2} updates (start + ${workIds.length} works + complete)`);

  if (progressUpdates.length > 0) {
    const firstUpdate = progressUpdates[0].data || progressUpdates[0];
    const lastUpdate = progressUpdates[progressUpdates.length - 1].data || progressUpdates[progressUpdates.length - 1];

    console.log(`\n   First update progress: ${firstUpdate.progress}`);
    console.log(`   Last update progress: ${lastUpdate.progress}`);

    if (lastUpdate.progress === 1.0) {
      console.log(`\n✅ SUCCESS: Enrichment completed successfully!`);
      process.exit(0);
    } else if (lastUpdate.error) {
      console.log(`\n⚠️  WARNING: Enrichment completed with error: ${lastUpdate.error}`);
      process.exit(1);
    } else {
      console.log(`\n⚠️  WARNING: Enrichment did not reach 100%`);
      process.exit(1);
    }
  } else {
    console.log(`\n❌ FAILURE: No progress updates received!`);
    process.exit(1);
  }
});

ws.on('error', (error) => {
  console.error(`\n❌ WebSocket error:`, error);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error(`\n❌ TIMEOUT: Test took too long (>30s)`);
  ws.close();
  process.exit(1);
}, 30000);
