# Troubleshooting

[English](troubleshooting.md) | [日本語](troubleshooting.ja.md)

## "No simulator UDID specified and no booted simulator found"

The simulator is not running.

```bash
# Boot the simulator
xcrun simctl boot "iPhone 15"
open -a Simulator
```

Or ask Claude: "Boot the iPhone 15 simulator".

## "idb describe-all failed"

fb-idb is not installed or cannot connect to the simulator.

```bash
# Install fb-idb
pip install fb-idb

# Verify it works
idb connect <simulator-udid>
idb ui describe-all
```

## Build Errors

Xcode command line tools may be outdated.

```bash
sudo xcode-select --install
```

## "Element not found"

The specified label element cannot be found.

1. Use `describe_ui` to check current screen elements
2. Verify exact match vs partial match for labels
3. Ensure element is visible on screen (may need scrolling)

## Screenshot comparison always shows differences

Dynamic content (time, animations, etc.) may be included.

- Set tolerance with the `tolerance` parameter
- Use `wait` before checkpoint to let the screen stabilize
- Consider avoiding comparison of dynamic areas

## HTML report not generated

When `updateBaselines: true`, no report is generated (save mode, not comparison mode).

Run in comparison mode:
```
Run the login-flow test case
```
