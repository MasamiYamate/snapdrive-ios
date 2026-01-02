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

iOS用のスナップショットテストツール。AI Agentを活用してiOS Simulatorを自律的に操作し、テストシナリオとBaselineを自動生成します。UIの変更にも柔軟に対応でき、テストケースの陳腐化を防ぎます。

## 必要環境

- macOS + Xcode
- Node.js 20+
- Python 3.x + fb-idb

## セットアップ

### 1. fb-idb (Python) をインストール

```bash
pip install fb-idb
```

### 2. Claude Desktop/Codeに設定

`.mcp.json`に追加:

```json
{
  "mcpServers": {
    "snapdrive": {
      "command": "npx",
      "args": ["snapdrive-ios-mcp"]
    }
  }
}
```

環境変数を設定する場合:

```json
{
  "mcpServers": {
    "snapdrive": {
      "command": "npx",
      "args": ["snapdrive-ios-mcp"],
      "env": {
        "SNAPDRIVE_RESULTS_DIR": "/path/to/your/project/results",
        "SNAPDRIVE_LOG_LEVEL": "debug"
      }
    }
  }
}
```

### 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `SNAPDRIVE_RESULTS_DIR` | 結果出力先 | `./results` |
| `SNAPDRIVE_LOG_LEVEL` | ログレベル (debug/info/warn/error) | `info` |

## バージョン管理

`.snapdrive`ディレクトリはGitにコミットしてください:

```bash
git add .snapdrive/
git commit -m "Add SnapDrive test cases and baselines"
```

テストシナリオとBaselineをチームで共有することで、全環境で一貫したビジュアルリグレッションテストが可能になります。

> **Note**: `results/`ディレクトリはテスト実行結果のため、`.gitignore`に追加してください。

## ドキュメント

- [使い方ガイド](docs/usage.md) - 基本的な操作方法
- [テストケース](docs/test-cases.md) - 構造化テストの作成と実行
- [CLI](docs/cli.md) - コマンドラインツールの使い方
- [Fastlane統合](docs/fastlane.md) - FastlaneでのCI/CD連携
- [MCPツール一覧](docs/tools.md) - 利用可能なツールのリファレンス

## ライセンス

MIT
