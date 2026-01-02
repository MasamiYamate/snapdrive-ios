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

Get all UI elements on the screen.

| Parameter | Type | Description |
|-----------|------|-------------|
| `deviceUdid` | string? | Target simulator UDID |

### find_element

Search for UI elements by label or type.

| Parameter | Type | Description |
|-----------|------|-------------|
| `label` | string? | Exact match label |
| `labelContains` | string? | Partial match label |
| `type` | string? | Element type |
| `deviceUdid` | string? | Target simulator UDID |

## Action Tools

### tap

Tap by coordinates or label.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | number? | X coordinate |
| `y` | number? | Y coordinate |
| `label` | string? | Tap target label |
| `labelContains` | string? | Partial match label |
| `duration` | number? | Long press duration (ms) |
| `deviceUdid` | string? | Target simulator UDID |

### swipe

Perform swipe gesture.

| Parameter | Type | Description |
|-----------|------|-------------|
| `direction` | string? | Direction (up/down/left/right) |
| `startX` | number? | Start X coordinate |
| `startY` | number? | Start Y coordinate |
| `endX` | number? | End X coordinate |
| `endY` | number? | End Y coordinate |
| `duration` | number? | Swipe duration (ms) |
| `deviceUdid` | string? | Target simulator UDID |

### type_text

Input text.

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | string | Input text |
| `deviceUdid` | string? | Target simulator UDID |

### wait

Wait for specified seconds.

| Parameter | Type | Description |
|-----------|------|-------------|
| `seconds` | number | Wait time in seconds |

### wait_for_element

Wait until an element appears.

| Parameter | Type | Description |
|-----------|------|-------------|
| `label` | string? | Exact match label |
| `labelContains` | string? | Partial match label |
| `type` | string? | Element type |
| `timeoutMs` | number? | Timeout (ms) |
| `deviceUdid` | string? | Target simulator UDID |

## Verification Tools

### compare_screenshot

Compare current screen with baseline image.

| Parameter | Type | Description |
|-----------|------|-------------|
| `baselineName` | string | Baseline name |
| `profile` | string? | Profile name (default: "default") |
| `tolerance` | number? | Tolerance (%) |
| `deviceUdid` | string? | Target simulator UDID |

### update_baseline

Save current screen as baseline.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Baseline name |
| `profile` | string? | Profile name |
| `deviceUdid` | string? | Target simulator UDID |

## Simulator Management

### list_simulators

Get list of available simulators.

### boot_simulator

Boot a simulator.

| Parameter | Type | Description |
|-----------|------|-------------|
| `udid` | string? | Simulator UDID |
| `name` | string? | Simulator name |

### install_app

Install a .app bundle.

| Parameter | Type | Description |
|-----------|------|-------------|
| `appPath` | string | Path to .app bundle |
| `deviceUdid` | string? | Target simulator UDID |

### launch_app

Launch an app.

| Parameter | Type | Description |
|-----------|------|-------------|
| `bundleId` | string | Bundle ID |
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
| `projectDir` | string? | Project directory |
| `simulatorName` | string? | Simulator name |
| `configuration` | string? | Build configuration (Debug/Release) |

### open_url

Open a URL or deep link.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | URL |
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
| `testCaseId` | string? | Test case ID |
| `testCasePath` | string? | Full path to test case |
| `snapdriveDir` | string? | Path to .snapdrive directory |
| `updateBaselines` | boolean? | Baseline update mode |
| `generateReport` | boolean? | Generate report (default: true) |
| `deviceUdid` | string? | Target simulator UDID |

### run_all_tests

Run all test cases and generate HTML report.

| Parameter | Type | Description |
|-----------|------|-------------|
| `snapdriveDir` | string? | Path to .snapdrive directory |
| `updateBaselines` | boolean? | Baseline update mode |
| `generateReport` | boolean? | Generate report (default: true) |
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
