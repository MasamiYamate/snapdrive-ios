# Test Cases

[English](test-cases.md) | [日本語](test-cases.ja.md)

Define structured test cases and run reproducible tests.

## Directory Structure

```
your-project/
├── .snapdrive/
│   ├── test-cases/
│   │   ├── login-flow/
│   │   │   ├── scenario.yaml       # Scenario definition
│   │   │   └── baselines/
│   │   │       ├── login_screen.png
│   │   │       └── home_screen.png
│   │   └── profile-view/
│   │       ├── scenario.yaml
│   │       └── baselines/
│   └── results/                    # Auto-generated
│       └── 2025-01-01T.../
│           ├── report.html         # HTML report
│           ├── screenshots/
│           └── diffs/
```

## Scenario File (scenario.yaml)

```yaml
name: Login Flow
description: Login with email/password and verify home screen
steps:
  - action: launch_app
    bundleId: com.example.app

  - action: tap
    label: "Login"

  - action: type_text
    text: "test@example.com"
    target: "Email"

  - action: tap
    label: "Next"

  - action: type_text
    text: "password123"
    target: "Password"

  - action: tap
    label: "Submit"

  - action: wait_for_element
    label: "Home"
    timeoutMs: 10000

  - action: checkpoint
    name: home_screen
    compare: true
```

## Available Actions

| Action | Parameters | Description |
|--------|------------|-------------|
| `launch_app` | bundleId | Launch app |
| `terminate_app` | bundleId | Terminate app |
| `tap` | label, labelContains, x, y, duration | Tap |
| `swipe` | direction, startX/Y, endX/Y, distance | Swipe |
| `type_text` | text, target | Text input |
| `wait` | seconds | Wait |
| `wait_for_element` | label, labelContains, type, timeoutMs | Wait for element |
| `scroll_to_element` | label, labelContains, direction, distance | Scroll until element visible |
| `checkpoint` | name, compare, tolerance | Screenshot comparison |
| `full_page_checkpoint` | name, scrollDirection, maxScrolls, stitchImages | Full scrollable screenshot comparison |
| `smart_checkpoint` | name, tolerance | **Auto-detect** (full_page if scrollable, otherwise checkpoint) |
| `open_url` | url | Open URL/deep link |

### About smart_checkpoint (Recommended)

Automatically detects if the screen contains scrollable views (UIScrollView, UITableView, UICollectionView, etc.) and captures appropriately:

```yaml
- action: smart_checkpoint
  name: settings_screen
  tolerance: 0.01
```

**Behavior:**
1. Analyze UI elements on screen
2. Detect scrollable views
3. If detected → Capture entire scrollable content with `full_page_checkpoint`
4. If not detected → Capture current screen with regular `checkpoint`

**Ideal for navigation tests:** Automatically verifies destination screen content with the appropriate method.

### About full_page_checkpoint

Captures and compares the entire scrollable screen:

```yaml
- action: full_page_checkpoint
  name: scrollable_list
  scrollDirection: down    # up or down (default: down)
  maxScrolls: 10           # Maximum scroll count (default: 10)
  stitchImages: true       # Stitch images together (default: true)
  tolerance: 0.01          # Tolerance
```

**Behavior:**
1. Auto-scroll to top of screen (until no change)
2. Take screenshot
3. Scroll slightly and capture again
4. Repeat until screen stops changing (auto end detection)
5. If `stitchImages: true`, stitch all images vertically into one long image for comparison
6. If `stitchImages: false`, compare each segment individually

**End Detection:** Scrolling ends when two consecutive identical screenshots are captured. maxScrolls is a safety limit (default 50).

## Creating Test Cases

### Create with Natural Language (Recommended)

Simply describe the test case to Claude in natural language, and AI will exploratively create the scenario:

```
Create a test case for login functionality.
Enter email and password to login,
and verify that the home screen is displayed.
```

Claude automatically:
1. Launches app and explores the screen
2. Builds steps while checking UI elements
3. Sets appropriate checkpoints
4. Saves scenario with `create_test_case`

## Running Tests

### Baseline Creation (First Time)

```
Run the login-flow test case and update baselines
```

Screenshots are saved as baseline images at each checkpoint.

### Test Execution

```
Run the login-flow test case
```

HTML report is automatically generated.

### Run All Tests

```
Run all test cases
```

## HTML Report

Auto-generated at `results/<timestamp>/report.html` after test execution:

- **Test Summary**: Success/failure count, pass rate
- **Step Execution Results**: Success/failure and duration for each step
- **Screenshot Comparison**: Actual / Baseline / Diff displayed side by side
- **Diff Highlighting**: Different pixels highlighted in magenta
- **Self-contained**: Base64 embedded, shareable as a single HTML file
