<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/header.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/images/header.png">
    <img src="docs/images/header.png" alt="SnapDrive" width="800" style="max-width: 100%; height: auto;">
  </picture>
</p>

<p align="center">
  <strong>MCP Server for iOS Simulator Automation</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

---

# SnapDrive MCP Server

An MCP server for iOS Simulator automation. Control the simulator with natural language from Claude Desktop/Code.

## Features

- **Natural Language Control**: Just say "tap the login button" and it works
- **Auto Build & Run**: Specify Xcode scheme name to build → install → launch
- **Screenshot Comparison**: Detect differences against baseline images
- **HTML Reports**: Visually review test results and screenshot diffs
- **CLI Support**: Command-line tool for CI/CD integration

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

## Documentation

- [Usage Guide](docs/usage.md) - Basic operations
- [Test Cases](docs/test-cases.md) - Creating and running structured tests
- [CLI](docs/cli.md) - Command-line tool usage
- [MCP Tools Reference](docs/tools.md) - Available tools reference
- [Troubleshooting](docs/troubleshooting.md)

## License

MIT
