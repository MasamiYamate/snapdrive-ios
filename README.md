# SnapDrive MCP Server

iOS Simulator自動操作用のMCPサーバー。Claude Desktop/Codeから自然言語でシミュレーターを操作できます。

## 特徴

- **自然言語で操作**: 「ログインボタンをタップして」だけでOK
- **自動ビルド&実行**: Xcodeスキーム名を指定するだけでビルド→インストール→起動
- **スクリーンショット比較**: baseline画像との差分検出
- **要素検索**: ラベルやタイプでUI要素を検索してタップ
- **構造化テストケース**: YAMLでシナリオを定義、再現可能なテスト実行
- **HTMLレポート**: テスト結果とスクリーンショット差分を視覚的に確認

## 必要環境

- macOS + Xcode
- Node.js 20+
- Python 3.x + fb-idb

## セットアップ

### 1. fb-idb (Python) をインストール

```bash
pip install fb-idb
```

### 2. SnapDrive MCPをビルド

```bash
cd snapdrive-agent
npm install
npm run build
```

### 3. Claude Desktop/Codeに設定

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "snapdrive": {
      "command": "node",
      "args": ["/path/to/snapdrive-agent/dist/index.js"],
      "env": {
        "SNAPDRIVE_BASELINES_DIR": "/path/to/your/project/baselines",
        "SNAPDRIVE_RESULTS_DIR": "/path/to/your/project/results"
      }
    }
  }
}
```

## 使い方

### 基本的な指示例

```
シミュレーターのスクリーンショットを撮って
```

```
画面の要素一覧を見せて
```

```
「ログイン」ボタンをタップして
```

### ビルド&実行

```
MyAppスキームをビルドしてiPhone 15で起動して
```

これだけで:
1. .xcworkspace/.xcodeprojを自動検出
2. xcodebuildでビルド
3. シミュレーター起動（未起動なら）
4. アプリをインストール&起動

### テストシナリオ

```
MyAppをビルドして起動したら:
1. 「ログイン」ボタンをタップ
2. メールアドレス欄に "test@example.com" を入力
3. パスワード欄に "password123" を入力
4. 「送信」ボタンをタップ
5. 「ホーム」が表示されるまで待って
6. スクリーンショットを撮って
```

### Baseline比較

```
現在の画面を "home_screen" としてbaselineに保存して
```

```
"home_screen" のbaselineと比較して
```

## 構造化テストケース

`.snapdrive`ディレクトリにテストケースを定義し、再現可能なテストを実行できます。

### ディレクトリ構造

```
your-project/
├── .snapdrive/
│   ├── test-cases/
│   │   ├── login-flow/
│   │   │   ├── scenario.yaml       # シナリオ定義
│   │   │   └── baselines/
│   │   │       ├── login_screen.png
│   │   │       └── home_screen.png
│   │   └── profile-view/
│   │       ├── scenario.yaml
│   │       └── baselines/
│   └── results/                    # 自動生成
│       └── 2025-01-01T.../
│           ├── report.html         # HTMLレポート
│           ├── screenshots/
│           └── diffs/
```

### シナリオファイル（scenario.yaml）

```yaml
name: ログインフロー
description: メール/パスワードでログインしてホーム画面を確認
steps:
  - action: launch_app
    bundleId: com.example.app

  - action: tap
    label: "ログイン"

  - action: type_text
    text: "test@example.com"
    target: "メールアドレス"

  - action: tap
    label: "次へ"

  - action: type_text
    text: "password123"
    target: "パスワード"

  - action: tap
    label: "送信"

  - action: wait_for_element
    label: "ホーム"
    timeoutMs: 10000

  - action: checkpoint
    name: home_screen
    compare: true
```

### 使用可能なアクション

| アクション | パラメータ | 説明 |
|-----------|-----------|------|
| `launch_app` | bundleId | アプリを起動 |
| `terminate_app` | bundleId | アプリを終了 |
| `tap` | label, labelContains, x, y, duration | タップ |
| `swipe` | direction, startX/Y, endX/Y, distance | スワイプ |
| `type_text` | text, target | テキスト入力 |
| `wait` | seconds | 待機 |
| `wait_for_element` | label, labelContains, type, timeoutMs | 要素出現待機 |
| `scroll_to_element` | label, labelContains, direction, distance | **要素が見えるまでスクロール** |
| `checkpoint` | name, compare, tolerance | スクリーンショット比較 |
| `open_url` | url | URL/ディープリンクを開く |

### テストケースの作成（自然言語）

Claudeに自然言語でテストケースを説明するだけで、AIが探索的にシナリオを作成します：

```
ログイン機能のテストケースを作成して。
メールアドレスとパスワードを入力してログインし、
ホーム画面が表示されることを確認するシナリオにして。
```

Claudeは以下を自動で行います：
1. アプリを起動して画面を探索
2. UI要素を確認しながらステップを構築
3. 適切なcheckpointを設定
4. `create_test_case`でシナリオを保存

### Baseline作成（初回実行）

```
login-flowテストケースを実行してbaselineを更新して
```

これにより各checkpointでスクリーンショットがbaseline画像として保存されます。

### テスト実行

```
login-flowテストケースを実行して
```

→ 自動的にHTMLレポートが生成されます

または全テスト実行:

```
すべてのテストケースを実行して
```

### HTMLレポート

テスト実行後、`results/<timestamp>/report.html`にHTMLレポートが自動生成されます:

- **テストサマリー**: 成功/失敗数、パス率
- **ステップ実行結果**: 各ステップの成否と所要時間
- **スクリーンショット比較**: Actual / Baseline / Diff を3カラムで並列表示
- **差分ハイライト**: 差分ピクセルをマゼンタで強調表示
- **クリックで拡大**: 画像をクリックしてフルサイズ確認
- **自己完結型**: 画像がBase64埋め込みなのでHTMLファイル単体で共有可能

## 提供ツール一覧

### 観測ツール
| ツール | 説明 |
|--------|------|
| `screenshot` | スクリーンショット取得（base64画像を返す） |
| `describe_ui` | 画面上の全UI要素を取得 |
| `find_element` | ラベル・タイプでUI要素を検索 |

### 操作ツール
| ツール | 説明 |
|--------|------|
| `tap` | 座標またはラベル指定でタップ |
| `swipe` | スワイプ操作（方向または座標指定） |
| `type_text` | テキスト入力 |
| `wait` | 指定秒数待機 |
| `wait_for_element` | 要素が表示されるまで待機 |

### 検証ツール
| ツール | 説明 |
|--------|------|
| `compare_screenshot` | baseline画像と比較 |
| `update_baseline` | 現在の画面をbaselineとして保存 |

### シミュレーター管理
| ツール | 説明 |
|--------|------|
| `list_simulators` | 利用可能なシミュレーター一覧 |
| `boot_simulator` | シミュレーターを起動 |
| `install_app` | .appバンドルをインストール |
| `launch_app` | アプリを起動（bundle ID指定） |
| `terminate_app` | アプリを終了 |
| `build_and_run` | **Xcodeスキーム名でビルド→インストール→起動** |
| `open_url` | URLまたはディープリンクを開く |

### テストケース管理
| ツール | 説明 |
|--------|------|
| `list_test_cases` | `.snapdrive/test-cases`内のテストケース一覧 |
| `run_test_case` | **テスト実行 → 比較 → HTMLレポート生成** |
| `run_all_tests` | 全テストケースを一括実行してHTMLレポート生成 |
| `create_test_case` | **シナリオ付きでテストケースを作成**（AIが探索的に生成可能） |

## 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `SNAPDRIVE_BASELINES_DIR` | baseline画像の保存先 | `./baselines` |
| `SNAPDRIVE_RESULTS_DIR` | 結果出力先 | `./results` |
| `SNAPDRIVE_LOG_LEVEL` | ログレベル (debug/info/warn/error) | `info` |

## ディレクトリ構造

```
your-project/
├── baselines/           # baseline画像
│   └── default/
│       └── home_screen.png
├── results/             # テスト結果（自動生成）
│   └── 2025-01-01T.../
│       ├── screenshots/
│       └── diffs/
└── snapdrive-agent/     # このリポジトリ
```

## トラブルシューティング

### "No simulator UDID specified and no booted simulator found"

シミュレーターが起動していません。

```bash
# シミュレーターを起動
xcrun simctl boot "iPhone 15"
open -a Simulator
```

または、Claudeに「iPhone 15シミュレーターを起動して」と指示。

### "idb describe-all failed"

fb-idbがインストールされていないか、シミュレーターに接続できていません。

```bash
# fb-idbをインストール
pip install fb-idb

# 動作確認
idb connect <simulator-udid>
idb ui describe-all
```

### ビルドエラー

Xcodeのコマンドラインツールが古い可能性があります。

```bash
sudo xcode-select --install
```

## CLI（コマンドライン実行）

Claudeを介さずにテストを実行できます。CI/CD統合に最適です。

### インストール

```bash
npm run build
```

### コマンド

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

### オプション

| オプション | 説明 |
|-----------|------|
| `--all` | 全テストケースを実行 |
| `--update-baselines` | ベースライン画像を更新（比較ではなく保存） |
| `--snapdrive-dir <path>` | `.snapdrive`ディレクトリのパス（デフォルト: `./.snapdrive`） |
| `--results-dir <path>` | 結果出力先（デフォルト: `./results`） |
| `--device <udid>` | 対象シミュレーターのUDID |
| `--verbose` | 詳細ログを出力 |

### CI/CD統合例

```yaml
# GitHub Actions
- name: Run UI Tests
  run: |
    npx snapdrive run --all
  continue-on-error: true

- name: Upload Test Report
  uses: actions/upload-artifact@v4
  with:
    name: test-report
    path: results/*/report.html
```

### 終了コード

- `0`: 全テスト成功
- `1`: テスト失敗またはエラー

## 開発

```bash
# 開発モード（watchビルド）
npm run dev

# テスト
npm test

# 型チェック
npm run typecheck
```

## ライセンス

MIT
