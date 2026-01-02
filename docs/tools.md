# MCP Tools Reference

[English](tools.md) | [日本語](tools.ja.md)

Reference for tools provided by the SnapDrive MCP server.

## Observation Tools

### screenshot

Capture a screenshot (returns base64 image).

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string? | Screenshot name |
| `deviceUdid` | string? | Target simulator UDID |

### describe_ui

Get all UI elements on the screen via accessibility tree.

| Parameter | Type | Description |
|-----------|------|-------------|
| `deviceUdid` | string? | Target simulator UDID |

## Action Tools

### tap

Tap at specific coordinates.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | number | X coordinate |
| `y` | number | Y coordinate |
| `duration` | number? | Long press duration (ms) |
| `deviceUdid` | string? | Target simulator UDID |

### swipe

Perform swipe gesture.

| Parameter | Type | Description |
|-----------|------|-------------|
| `startX` | number | Start X coordinate |
| `startY` | number | Start Y coordinate |
| `endX` | number | End X coordinate |
| `endY` | number | End Y coordinate |
| `duration` | number? | Swipe duration (ms) |
| `deviceUdid` | string? | Target simulator UDID |

### type_text

Input text into focused text field.

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | string | Text to type |
| `deviceUdid` | string? | Target simulator UDID |

### wait

Wait for specified seconds.

| Parameter | Type | Description |
|-----------|------|-------------|
| `seconds` | number | Wait time (0.1 to 30 seconds) |

## Simulator Management

### list_simulators

Get list of available simulators.

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | string? | Filter by state: "booted", "shutdown", or "all" (default: "all") |

### launch_app

Launch an app.

| Parameter | Type | Description |
|-----------|------|-------------|
| `bundleId` | string | Bundle ID |
| `args` | string[]? | Launch arguments |
| `terminateExisting` | boolean? | Terminate existing instance (default: true) |
| `deviceUdid` | string? | Target simulator UDID |

### terminate_app

Terminate an app.

| Parameter | Type | Description |
|-----------|------|-------------|
| `bundleId` | string | Bundle ID |
| `deviceUdid` | string? | Target simulator UDID |

### build_and_run

Build, install, and launch using Xcode scheme name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scheme` | string | Xcode scheme name |
| `projectPath` | string? | Path to .xcodeproj or .xcworkspace (auto-detected if omitted) |
| `simulatorName` | string? | Simulator name (default: "iPhone 15") |
| `configuration` | string? | Build configuration: "Debug" or "Release" (default: "Debug") |
| `deviceUdid` | string? | Target simulator UDID |

### open_url

Open a URL or deep link.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | URL or deep link |
| `deviceUdid` | string? | Target simulator UDID |

## Location Tools

### set_location

Set simulated GPS location.

| Parameter | Type | Description |
|-----------|------|-------------|
| `latitude` | number | Latitude (-90 to 90) |
| `longitude` | number | Longitude (-180 to 180) |
| `deviceUdid` | string? | Target simulator UDID |

### clear_location

Clear simulated GPS location (revert to default).

| Parameter | Type | Description |
|-----------|------|-------------|
| `deviceUdid` | string? | Target simulator UDID |

### simulate_route

Simulate GPS movement along a route (for navigation testing).

| Parameter | Type | Description |
|-----------|------|-------------|
| `waypoints` | array | Array of {latitude, longitude} waypoints |
| `intervalMs` | number? | Time between waypoints in ms (default: 3000) |
| `deviceUdid` | string? | Target simulator UDID |

## Test Case Management

### list_test_cases

Get list of test cases in `.snapdrive/test-cases`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `snapdriveDir` | string? | Path to .snapdrive directory |

### run_test_case

Run a test case and generate HTML report.

| Parameter | Type | Description |
|-----------|------|-------------|
| `testCaseId` | string? | Test case ID (directory name) |
| `testCasePath` | string? | Full path to test case directory |
| `snapdriveDir` | string? | Path to .snapdrive directory |
| `updateBaselines` | boolean? | Update baselines instead of comparing (default: false) |
| `generateReport` | boolean? | Generate HTML report (default: true) |
| `deviceUdid` | string? | Target simulator UDID |

### run_all_tests

Run all test cases and generate HTML report.

| Parameter | Type | Description |
|-----------|------|-------------|
| `snapdriveDir` | string? | Path to .snapdrive directory |
| `updateBaselines` | boolean? | Update baselines instead of comparing (default: false) |
| `generateReport` | boolean? | Generate HTML report (default: true) |
| `deviceUdid` | string? | Target simulator UDID |

### create_test_case

Create a new test case, optionally capturing baselines simultaneously.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Test case ID (directory name) |
| `displayName` | string? | Display name |
| `description` | string? | Description |
| `steps` | array? | Scenario steps |
| `createBaselines` | boolean? | Execute scenario and capture baselines (default: false) |
| `deviceUdid` | string? | Target simulator UDID |
| `snapdriveDir` | string? | Path to .snapdrive directory |

**Checkpoint action types:**
- `checkpoint`: Capture current screen only
- `full_page_checkpoint`: Scroll and capture entire content
- `smart_checkpoint`: **Recommended** - Auto-detect scrollable views and choose appropriate method
