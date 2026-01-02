# Usage Guide

[English](usage.md) | [日本語](usage.ja.md)

## Workflow Overview

Testing with SnapDrive follows this flow:

1. **Create test scenario** - Instruct AI Agent in natural language, Baseline captured simultaneously
2. **Commit to repository** - Share scenarios and Baselines with your team
3. **Diff verification** - Detect differences from Baseline on subsequent runs

## Step 1: Create Test Scenario

Simply tell the AI Agent what you want to test in natural language, and it will automatically create the scenario and capture Baselines.

> **Note**: When creating test cases, AI Agent **does not modify your app's implementation code**. Tests are for verifying existing behavior.

### Navigation Test Examples

```
I want to test navigation from launch screen to login screen.
Create a test case named "navigate-to-login".
```

```
I want to tap "Settings" in the tab bar and verify ProfileViewController is displayed.
Create a test case named "open-profile".
```

AI Agent will automatically:
1. Launch the app and check the current screen
2. Execute specified operations while building the scenario
3. Set `smart_checkpoint` at the destination screen
   - Captures full page if scrollable view exists
   - Otherwise takes a normal screenshot
4. Capture Baseline and save to `.snapdrive/test-cases/`

### Testing Complete Flows

```
I want to test the login flow.
1. Tap "Login" button on launch screen
2. Enter email and password, then submit
3. Verify home screen is displayed
Create it as "login-flow".
```

```
I want to test adding a product to cart through purchase completion.
Create it as "purchase-flow".
```

## Step 2: Commit to Repository

Commit the created test cases and Baselines to Git:

```bash
git add .snapdrive/
git commit -m "Add login-flow test case with baselines"
```

Including Baselines in the repository allows the entire team to verify UI against the same standards.

## Step 3: Diff Verification

After code changes, run tests to detect UI differences:

```
Run the login-flow test case
```

Compares current screen with Baseline, and if there are differences, you can review them in the HTML report.

### Updating Baselines

For intentional UI changes, update the Baselines:

```
Run the login-flow test case and update baselines
```

## Next Steps

- [Test Case Details](test-cases.md) - Scenario file format and action reference
- [CLI Automation](cli.md) - Using with CI/CD
