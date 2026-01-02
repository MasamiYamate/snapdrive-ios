# CLI（コマンドライン実行）

[English](cli.md) | [日本語](cli.ja.md)

Claudeを介さずにテストを実行できます。CI/CD統合に最適です。

## コマンド

```bash
# テストケース一覧
npx snapdrive list

# 特定のテストケースを実行
npx snapdrive run login-flow

# 全テストケースを実行
npx snapdrive run --all

# ベースライン更新モード
npx snapdrive run login-flow --update-baselines

# 詳細ログ出力
npx snapdrive run --all --verbose
```

## オプション

| オプション | 説明 |
|-----------|------|
| `--all` | 全テストケースを実行 |
| `--update-baselines` | ベースライン画像を更新（比較ではなく保存） |
| `--snapdrive-dir <path>` | `.snapdrive`ディレクトリのパス（デフォルト: `./.snapdrive`） |
| `--results-dir <path>` | 結果出力先（デフォルト: `./results`） |
| `--device <udid>` | 対象シミュレーターのUDID |
| `--verbose` | 詳細ログを出力 |

## CI/CD統合例

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
        run: npx snapdrive run --all
        continue-on-error: true

      - name: Upload Test Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-report
          path: results/*/report.html
```

## 終了コード

| コード | 意味 |
|--------|------|
| `0` | 全テスト成功 |
| `1` | テスト失敗またはエラー |

## ローカル開発

```bash
# ビルド
npm run build

# npm linkでグローバルに登録
npm link

# 直接実行
snapdrive list
snapdrive run login-flow
```
