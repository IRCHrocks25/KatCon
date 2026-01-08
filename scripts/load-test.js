#!/usr/bin/env node

/**
 * Load Testing Script for KatCon
 * Simulates multiple concurrent users accessing the application
 */

import https from "https";
import http from "http";
import { fileURLToPath } from "url";

class LoadTester {
  constructor(options = {}) {
    this.users = options.users || 10;
    this.duration = options.duration || 30;
    this.baseUrl = options.url || "http://localhost:3000";
    this.verbose = options.verbose || false;
    this.authHeader = options.auth || null;

    this.host = this.baseUrl.replace(/^https?:\/\//, "");
    this.protocol = this.baseUrl.startsWith("https") ? https : http;

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      startTime: Date.now(),
      endTime: null,
    };

    this.isRunning = false;
  }

  log(message, force = false) {
    if (this.verbose || force) {
      console.log(`[${new Date().toISOString()}] ${message}`);
    }
  }

  makeRequest(endpoint = "/api/health", method = "GET") {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const headers = {
        "User-Agent": "KatCon-LoadTester/1.0",
        Accept: "application/json",
      };

      if (this.authHeader) {
        headers["Authorization"] = this.authHeader;
      }

      const options = {
        hostname: this.host,
        path: endpoint,
        method: method,
        headers,
        timeout: 10000,
      };

      const req = this.protocol.request(options, (res) => {
        const responseTime = Date.now() - startTime;

        this.stats.totalRequests++;
        this.stats.responseTimes.push(responseTime);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.stats.successfulRequests++;
          this.log(`✅ ${method} ${endpoint} - ${res.statusCode} (${responseTime}ms)`);
        } else {
          this.stats.failedRequests++;
          this.log(`❌ ${method} ${endpoint} - ${res.statusCode} (${responseTime}ms)`);
        }

        res.on("data", () => {});
        res.on("end", () => resolve());
      });

      req.on("error", (error) => {
        const responseTime = Date.now() - startTime;

        this.stats.totalRequests++;
        this.stats.failedRequests++;
        this.stats.responseTimes.push(responseTime);

        this.log(
          `❌ ${method} ${endpoint} - Error: ${error.message} (${responseTime}ms)`
        );
        resolve();
      });

      req.on("timeout", () => {
        req.destroy();
        const responseTime = Date.now() - startTime;

        this.stats.totalRequests++;
        this.stats.failedRequests++;
        this.stats.responseTimes.push(responseTime);

        this.log(`⏰ ${method} ${endpoint} - Timeout (${responseTime}ms)`);
        resolve();
      });

      req.end();
    });
  }

  makePostRequest(endpoint) {
    return this.makeRequest(endpoint, "POST");
  }

  async simulateUser(userId) {
    this.log(`👤 User ${userId} started`);

    const actions = [
      () => this.makeRequest("/api/health"),
      () => this.makeRequest("/api/users/list"),
      () => this.makePostRequest("/api/reminders/notify-stale"),
      () => this.makeRequest("/api/messaging/conversations"),
    ];

    while (this.isRunning) {
      const action = actions[Math.floor(Math.random() * actions.length)];
      await action();

      const delay = Math.random() * 1500 + 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.log(`👤 User ${userId} finished`);
  }

  calculateStats() {
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;
    const rps = this.stats.totalRequests / duration;

    const times = [...this.stats.responseTimes].sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    return {
      duration,
      totalRequests: this.stats.totalRequests,
      successfulRequests: this.stats.successfulRequests,
      failedRequests: this.stats.failedRequests,
      requestsPerSecond: rps.toFixed(2),
      averageResponseTime: Math.round(avg),
      p95ResponseTime: times[Math.floor(times.length * 0.95)] || 0,
      p99ResponseTime: times[Math.floor(times.length * 0.99)] || 0,
      successRate: (
        (this.stats.successfulRequests / this.stats.totalRequests) *
        100
      ).toFixed(2),
    };
  }

  async run() {
    console.log(`🚀 Starting load test...`);
    console.log(
      `📊 ${this.users} concurrent users for ${this.duration} seconds`
    );
    console.log(`🌐 Target: ${this.baseUrl}`);
    console.log(`🔐 Auth: ${this.authHeader ? "Enabled" : "None"}`);
    console.log(`⏱️  Please wait...\n`);

    this.isRunning = true;
    this.stats.startTime = Date.now();

    const users = [];
    for (let i = 1; i <= this.users; i++) {
      users.push(this.simulateUser(i));
    }

    await new Promise((resolve) => setTimeout(resolve, this.duration * 1000));

    this.isRunning = false;
    this.stats.endTime = Date.now();

    await Promise.all(users);

    const stats = this.calculateStats();

    console.log(`\n📈 Load Test Results:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`⏱️  Duration: ${stats.duration.toFixed(2)}s`);
    console.log(`📊 Total Requests: ${stats.totalRequests}`);
    console.log(`✅ Successful: ${stats.successfulRequests}`);
    console.log(`❌ Failed: ${stats.failedRequests}`);
    console.log(`📈 Requests/sec: ${stats.requestsPerSecond}`);
    console.log(`🎯 Success Rate: ${stats.successRate}%`);
    console.log(`⚡ Avg Response Time: ${stats.averageResponseTime}ms`);
    console.log(`📊 P95 Response Time: ${stats.p95ResponseTime}ms`);
    console.log(`📊 P99 Response Time: ${stats.p99ResponseTime}ms`);
  }
}

/* ---------------- CLI ARG PARSING ---------------- */

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--users":
        options.users = parseInt(args[++i], 10);
        break;
      case "--duration":
        options.duration = parseInt(args[++i], 10);
        break;
      case "--url":
        options.url = args[++i];
        break;
      case "--auth":
        options.auth = args[++i];
        break;
      case "--verbose":
        options.verbose = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

/* ---------------- ENTRY POINT ---------------- */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs();
  const tester = new LoadTester(options);

  tester.run().catch((err) => {
    console.error("❌ Load test failed:", err);
    process.exit(1);
  });
}

export default LoadTester;
