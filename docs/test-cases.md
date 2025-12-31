# テストケース

構造化されたテストケースを定義し、再現可能なテストを実行できます。

## ディレクトリ構造

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

## シナリオファイル（scenario.yaml）

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

## 使用可能なアクション

| アクション | パラメータ | 説明 |
|-----------|-----------|------|
| `launch_app` | bundleId | アプリを起動 |
| `terminate_app` | bundleId | アプリを終了 |
| `tap` | label, labelContains, x, y, duration | タップ |
| `swipe` | direction, startX/Y, endX/Y, distance | スワイプ |
| `type_text` | text, target | テキスト入力 |
| `wait` | seconds | 待機 |
| `wait_for_element` | label, labelContains, type, timeoutMs | 要素出現待機 |
| `scroll_to_element` | label, labelContains, direction, distance | 要素が見えるまでスクロール |
| `checkpoint` | name, compare, tolerance | スクリーンショット比較 |
| `full_page_checkpoint` | name, scrollDirection, maxScrolls, stitchImages | スクロール全体のスクリーンショット比較 |
| `open_url` | url | URL/ディープリンクを開く |

### full_page_checkpoint について

スクロール可能な画面全体をキャプチャして比較します:

```yaml
- action: full_page_checkpoint
  name: scrollable_list
  scrollDirection: down    # up または down（デフォルト: down）
  maxScrolls: 10           # 最大スクロール回数（デフォルト: 10）
  stitchImages: true       # 画像を結合するか（デフォルト: true）
  tolerance: 0.01          # 許容誤差
```

**動作:**
1. 画面上部まで自動スクロール（変化がなくなるまで）
2. スクリーンショットを撮影
3. 少しスクロールして再撮影
4. 画面が変わらなくなるまで繰り返し（自動終端検出）
5. `stitchImages: true` の場合、全画像を縦に結合して1枚の長い画像として比較
6. `stitchImages: false` の場合、各セグメントを個別に比較

**終端検出:** 連続2回同じスクリーンショットが撮れた時点でスクロール終了と判定します。maxScrollsは安全上限（デフォルト50）です。

## テストケースの作成

### 自然言語で作成（推奨）

Claudeに自然言語でテストケースを説明するだけで、AIが探索的にシナリオを作成します:

```
ログイン機能のテストケースを作成して。
メールアドレスとパスワードを入力してログインし、
ホーム画面が表示されることを確認するシナリオにして。
```

Claudeは以下を自動で行います:
1. アプリを起動して画面を探索
2. UI要素を確認しながらステップを構築
3. 適切なcheckpointを設定
4. `create_test_case`でシナリオを保存

## テスト実行

### Baseline作成（初回）

```
login-flowテストケースを実行してbaselineを更新して
```

各checkpointでスクリーンショットがbaseline画像として保存されます。

### テスト実行

```
login-flowテストケースを実行して
```

自動的にHTMLレポートが生成されます。

### 全テスト実行

```
すべてのテストケースを実行して
```

## HTMLレポート

テスト実行後、`results/<timestamp>/report.html`に自動生成:

- **テストサマリー**: 成功/失敗数、パス率
- **ステップ実行結果**: 各ステップの成否と所要時間
- **スクリーンショット比較**: Actual / Baseline / Diff を横並びで表示
- **差分ハイライト**: 差分ピクセルをマゼンタで強調
- **自己完結型**: Base64埋め込みでHTMLファイル単体で共有可能
