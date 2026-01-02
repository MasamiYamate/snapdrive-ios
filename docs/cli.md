# CLI (Command Line Execution)

[English](cli.md) | [日本語](cli.ja.md)

Run tests without Claude. Ideal for CI/CD integration.

## Commands

```bash
# List test cases
npx snapdrive-ios-cli list

# Run specific test case
npx snapdrive-ios-cli run login-flow

# Run all test cases
npx snapdrive-ios-cli run --all

# Update baselines mode
npx snapdrive-ios-cli run login-flow --update-baselines

# Verbose output
npx snapdrive-ios-cli run --all --verbose
```

## Options

| Option | Description |
|--------|-------------|
| `--all` | Run all test cases |
| `--update-baselines` | Update baseline images (save instead of compare) |
| `--snapdrive-dir <path>` | Path to `.snapdrive` directory (default: `./.snapdrive`) |
| `--results-dir <path>` | Results output directory (default: `./results`) |
| `--device <udid>` | Target simulator UDID |
| `--verbose` | Enable verbose logging |

## CI/CD Integration Example

### GitHub Actions

```yaml
name: UI Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install fb-idb
        run: pip install fb-idb

      - name: Boot Simulator
        run: |
          xcrun simctl boot "iPhone 15"
          open -a Simulator

      - name: Run UI Tests
        run: npx snapdrive-ios-cli run --all
        continue-on-error: true

      - name: Upload Test Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-report
          path: results/*/report.html
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | Test failure or error |

