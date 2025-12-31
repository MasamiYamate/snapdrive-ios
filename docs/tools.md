# MCPツール一覧

SnapDrive MCPサーバーが提供するツールのリファレンスです。

## 観測ツール

### screenshot

スクリーンショットを取得します（base64画像を返す）。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `name` | string? | スクリーンショット名 |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### describe_ui

画面上の全UI要素を取得します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `deviceUdid` | string? | 対象シミュレーターUDID |

### find_element

ラベル・タイプでUI要素を検索します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `label` | string? | 完全一致ラベル |
| `labelContains` | string? | 部分一致ラベル |
| `type` | string? | 要素タイプ |
| `deviceUdid` | string? | 対象シミュレーターUDID |

## 操作ツール

### tap

座標またはラベル指定でタップします。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `x` | number? | X座標 |
| `y` | number? | Y座標 |
| `label` | string? | タップ対象のラベル |
| `labelContains` | string? | 部分一致ラベル |
| `duration` | number? | 長押し時間(ms) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### swipe

スワイプ操作を行います。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `direction` | string? | 方向 (up/down/left/right) |
| `startX` | number? | 開始X座標 |
| `startY` | number? | 開始Y座標 |
| `endX` | number? | 終了X座標 |
| `endY` | number? | 終了Y座標 |
| `duration` | number? | スワイプ時間(ms) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### type_text

テキストを入力します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `text` | string | 入力テキスト |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### wait

指定秒数待機します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `seconds` | number | 待機秒数 |

### wait_for_element

要素が表示されるまで待機します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `label` | string? | 完全一致ラベル |
| `labelContains` | string? | 部分一致ラベル |
| `type` | string? | 要素タイプ |
| `timeoutMs` | number? | タイムアウト(ms) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

## 検証ツール

### compare_screenshot

baseline画像と現在の画面を比較します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `baselineName` | string | ベースライン名 |
| `profile` | string? | プロファイル名 (default: "default") |
| `tolerance` | number? | 許容誤差(%) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### update_baseline

現在の画面をbaselineとして保存します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `name` | string | ベースライン名 |
| `profile` | string? | プロファイル名 |
| `deviceUdid` | string? | 対象シミュレーターUDID |

## シミュレーター管理

### list_simulators

利用可能なシミュレーター一覧を取得します。

### boot_simulator

シミュレーターを起動します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `udid` | string? | シミュレーターUDID |
| `name` | string? | シミュレーター名 |

### install_app

.appバンドルをインストールします。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `appPath` | string | .appバンドルのパス |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### launch_app

アプリを起動します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `bundleId` | string | バンドルID |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### terminate_app

アプリを終了します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `bundleId` | string | バンドルID |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### build_and_run

Xcodeスキーム名でビルド→インストール→起動します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `scheme` | string | Xcodeスキーム名 |
| `projectDir` | string? | プロジェクトディレクトリ |
| `simulatorName` | string? | シミュレーター名 |
| `configuration` | string? | ビルド構成 (Debug/Release) |

### open_url

URLまたはディープリンクを開きます。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `url` | string | URL |
| `deviceUdid` | string? | 対象シミュレーターUDID |

## テストケース管理

### list_test_cases

`.snapdrive/test-cases`内のテストケース一覧を取得します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `snapdriveDir` | string? | .snapdriveディレクトリのパス |

### run_test_case

テストケースを実行し、HTMLレポートを生成します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `testCaseId` | string? | テストケースID |
| `testCasePath` | string? | テストケースのフルパス |
| `snapdriveDir` | string? | .snapdriveディレクトリのパス |
| `updateBaselines` | boolean? | ベースライン更新モード |
| `generateReport` | boolean? | レポート生成 (default: true) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### run_all_tests

全テストケースを実行してHTMLレポートを生成します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `snapdriveDir` | string? | .snapdriveディレクトリのパス |
| `updateBaselines` | boolean? | ベースライン更新モード |
| `generateReport` | boolean? | レポート生成 (default: true) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### create_test_case

新規テストケースを作成し、オプションでBaselineも同時に取得します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `name` | string | テストケースID（ディレクトリ名） |
| `displayName` | string? | 表示名 |
| `description` | string? | 説明 |
| `steps` | array? | シナリオステップ |
| `createBaselines` | boolean? | シナリオ実行してBaselineを取得 (default: false) |
| `deviceUdid` | string? | 対象シミュレーターUDID |
| `snapdriveDir` | string? | .snapdriveディレクトリのパス |
