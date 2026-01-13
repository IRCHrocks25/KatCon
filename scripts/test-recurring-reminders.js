#!/usr/bin/env node

/**
 * Test script for recurring reminders functionality
 * Run with: npm run test-recurring
 */

import https from 'https';
import http from 'http';

const APP_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.APP_URL || 'http://localhost:3000';

console.log('🧪 Testing Recurring Reminders Functionality');
console.log('===========================================');
console.log(`Target URL: ${APP_URL}`);
console.log('');

// Test 1: Process recurring reminders
console.log('📋 Test 1: Processing Recurring Reminders');
console.log('-----------------------------------------');

const url = new URL(APP_URL);
const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
const requestModule = isLocalhost ? http : https;

const options = {
  hostname: url.hostname,
  port: url.port || (isLocalhost ? 3000 : 443),
  path: '/api/reminders/process-recurring',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const req = requestModule.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('Response:', JSON.stringify(response, null, 2));

      if (response.success) {
        console.log('✅ Test PASSED: Recurring reminders processed successfully');
        console.log(`   Processed: ${response.processed} reminders`);
        console.log(`   Errors: ${response.errors}`);
        console.log(`   Total found: ${response.total}`);
      } else {
        console.log('❌ Test FAILED: API returned error');
        console.log('Error details:', response);
      }
    } catch (error) {
      console.log('❌ Test FAILED: Invalid JSON response');
      console.log('Raw response:', data);
    }

    console.log('');
    console.log('📋 Test 2: Checking Reminder Creation');
    console.log('-------------------------------------');

    // Test reminder creation with recurring fields
    const createTest = {
      title: "Test Recurring Reminder",
      description: "This is a test recurring reminder",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      priority: "medium",
      assignedTo: [],
      isRecurring: true,
      rrule: "FREQ=DAILY;INTERVAL=1"
    };

    console.log('Creating test recurring reminder...');
    console.log('Payload:', JSON.stringify(createTest, null, 2));

    const createUrl = new URL(APP_URL);
    const createIsLocalhost = createUrl.hostname === 'localhost' || createUrl.hostname === '127.0.0.1';
    const createRequestModule = createIsLocalhost ? http : https;

    const createOptions = {
      hostname: createUrl.hostname,
      port: createUrl.port || (createIsLocalhost ? 3000 : 443),
      path: '/api/reminders/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: In a real test, you'd need proper authentication headers
      },
    };

    const createReq = createRequestModule.request(createOptions, (createRes) => {
      console.log(`Create Status: ${createRes.statusCode}`);

      let createData = '';
      createRes.on('data', (chunk) => {
        createData += chunk;
      });

      createRes.on('end', () => {
        console.log('Create Response:', createData);
        console.log('');
        console.log('🎉 Testing Complete!');
        console.log('');
        console.log('Next Steps:');
        console.log('1. Set up GitHub Actions secrets (APP_URL)');
        console.log('2. Push to GitHub to enable automatic processing');
        console.log('3. Monitor workflow runs in GitHub Actions');
        console.log('4. Test with real recurring reminders in the app');
      });
    });

    createReq.on('error', (error) => {
      console.log('❌ Create test failed (expected without auth):', error.message);
      console.log('');
      console.log('🎉 Basic API test complete!');
      console.log('');
      console.log('Next Steps:');
      console.log('1. Set up GitHub Actions secrets (APP_URL)');
      console.log('2. Push to GitHub to enable automatic processing');
      console.log('3. Monitor workflow runs in GitHub Actions');
      console.log('4. Test with real recurring reminders in the app');
    });

    createReq.write(JSON.stringify(createTest));
    createReq.end();
  });
});

req.on('error', (error) => {
  console.log('❌ Test FAILED: Network error');
  console.log('Error:', error.message);
  console.log('');
  console.log('Troubleshooting:');
  console.log('1. Make sure your app is running');
  console.log('2. Check APP_URL environment variable');
  console.log('3. Verify the API route exists');
});

req.end();