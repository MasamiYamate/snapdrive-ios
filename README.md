<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/header.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/images/header.png">
    <img src="docs/images/header.png" alt="SnapDrive" width="800" style="max-width: 100%; height: auto;">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

---

# SnapDrive

Snapshot testing tool for iOS. Leverages AI Agents to autonomously operate iOS Simulator, automatically generating test scenarios and baselines. Adapts flexibly to UI changes, preventing test case decay.

## Requirements

- macOS + Xcode
- Node.js 20+
- Python 3.x + fb-idb

## Setup

### 1. Install fb-idb (Python)

```bash
pip install fb-idb
```

### 2. Configure Claude Desktop/Code

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "snapdrive": {
      "command": "npx",
      "args": ["snapdrive-mcp"]
    }
  }
}
```

With environment variables:

```json
{
  "mcpServers": {
    "snapdrive": {
      "command": "npx",
      "args": ["snapdrive-mcp"],
      "env": {
        "SNAPDRIVE_BASELINES_DIR": "/path/to/your/project/.snapdrive/baselines",
        "SNAPDRIVE_RESULTS_DIR": "/path/to/your/project/results",
        "SNAPDRIVE_LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SNAPDRIVE_BASELINES_DIR` | Baseline images directory | `./baselines` |
| `SNAPDRIVE_RESULTS_DIR` | Results output directory | `./results` |
| `SNAPDRIVE_LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |

## Version Control

The `.snapdrive` directory should be committed to Git:

```bash
git add .snapdrive/
git commit -m "Add SnapDrive test cases and baselines"
```

This allows your team to share test scenarios and baselines, ensuring consistent visual regression testing across all environments.

> **Note**: The `results/` directory contains test execution outputs and should be added to `.gitignore`.

## Documentation

- [Usage Guide](docs/usage.md) - Basic operations
- [Test Cases](docs/test-cases.md) - Creating and running structured tests
- [CLI](docs/cli.md) - Command-line tool usage
- [Fastlane Integration](docs/fastlane.md) - CI/CD with Fastlane
- [MCP Tools Reference](docs/tools.md) - Available tools reference

## License

MIT
