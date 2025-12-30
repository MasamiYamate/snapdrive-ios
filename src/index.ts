#!/usr/bin/env node
/**
 * SnapDrive MCP Server - Entry Point
 * iOS Simulator automation via Model Context Protocol
 */

import { startServer } from './server.js';

startServer().catch((error) => {
  console.error('Failed to start SnapDrive MCP Server:', error);
  process.exit(1);
});
