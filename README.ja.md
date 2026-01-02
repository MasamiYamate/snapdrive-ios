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

# SnapDrive MCP Server

iOS Simulator自動操作用のMCPサーバー。Claude Desktop/Codeから自然言語でシミュレーターを操作できます。

## 特徴

- **自然言語で操作**: 「ログインボタンをタップして」だけでOK
- **自動ビルド&実行**: Xcodeスキーム名を指定するだけでビルド→インストール→起動
- **スクリーンショット比較**: baseline画像との差分検出
- **HTMLレポート**: テスト結果とスクリーンショット差分を視覚的に確認
- **CLI対応**: CI/CD統合用のコマンドラインツール

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
      "args": ["snapdrive-mcp"]
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

### 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `SNAPDRIVE_BASELINES_DIR` | baseline画像の保存先 | `./baselines` |
| `SNAPDRIVE_RESULTS_DIR` | 結果出力先 | `./results` |
| `SNAPDRIVE_LOG_LEVEL` | ログレベル (debug/info/warn/error) | `info` |

## ドキュメント

- [使い方ガイド](docs/usage.md) - 基本的な操作方法
- [テストケース](docs/test-cases.md) - 構造化テストの作成と実行
- [CLI](docs/cli.md) - コマンドラインツールの使い方
- [MCPツール一覧](docs/tools.md) - 利用可能なツールのリファレンス
- [トラブルシューティング](docs/troubleshooting.md)

## ライセンス

MIT
