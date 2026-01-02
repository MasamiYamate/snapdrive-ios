# MCPツール一覧

[English](tools.md) | [日本語](tools.ja.md)

SnapDrive MCPサーバーが提供するツールのリファレンスです。

## 観測ツール

### screenshot

スクリーンショットを取得します（base64画像を返す）。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `name` | string? | スクリーンショット名 |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### describe_ui

アクセシビリティツリーから画面上の全UI要素を取得します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `deviceUdid` | string? | 対象シミュレーターUDID |

## 操作ツール

### tap

指定座標をタップします。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `x` | number | X座標 |
| `y` | number | Y座標 |
| `duration` | number? | 長押し時間(ms) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### swipe

スワイプ操作を行います。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `startX` | number | 開始X座標 |
| `startY` | number | 開始Y座標 |
| `endX` | number | 終了X座標 |
| `endY` | number | 終了Y座標 |
| `duration` | number? | スワイプ時間(ms) |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### type_text

フォーカス中のテキストフィールドに入力します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `text` | string | 入力テキスト |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### wait

指定秒数待機します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `seconds` | number | 待機秒数（0.1〜30秒） |

## シミュレーター管理

### list_simulators

利用可能なシミュレーター一覧を取得します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `state` | string? | 状態でフィルタ: "booted", "shutdown", "all"（デフォルト: "all"） |

### launch_app

アプリを起動します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `bundleId` | string | バンドルID |
| `args` | string[]? | 起動引数 |
| `terminateExisting` | boolean? | 既存インスタンスを終了（デフォルト: true） |
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
| `projectPath` | string? | .xcodeprojまたは.xcworkspaceのパス（省略時は自動検出） |
| `simulatorName` | string? | シミュレーター名（デフォルト: "iPhone 15"） |
| `configuration` | string? | ビルド構成: "Debug"または"Release"（デフォルト: "Debug"） |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### open_url

URLまたはディープリンクを開きます。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `url` | string | URLまたはディープリンク |
| `deviceUdid` | string? | 対象シミュレーターUDID |

## 位置情報ツール

### set_location

GPS位置をシミュレートします。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `latitude` | number | 緯度（-90〜90） |
| `longitude` | number | 経度（-180〜180） |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### clear_location

シミュレートしたGPS位置をクリアします（デフォルトに戻す）。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `deviceUdid` | string? | 対象シミュレーターUDID |

### simulate_route

ルートに沿ったGPS移動をシミュレートします（ナビゲーションテスト用）。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `waypoints` | array | {latitude, longitude}の配列 |
| `intervalMs` | number? | ウェイポイント間の時間(ms)（デフォルト: 3000） |
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
| `testCaseId` | string? | テストケースID（ディレクトリ名） |
| `testCasePath` | string? | テストケースのフルパス |
| `snapdriveDir` | string? | .snapdriveディレクトリのパス |
| `updateBaselines` | boolean? | ベースライン更新モード（デフォルト: false） |
| `generateReport` | boolean? | HTMLレポート生成（デフォルト: true） |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### run_all_tests

全テストケースを実行してHTMLレポートを生成します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `snapdriveDir` | string? | .snapdriveディレクトリのパス |
| `updateBaselines` | boolean? | ベースライン更新モード（デフォルト: false） |
| `generateReport` | boolean? | HTMLレポート生成（デフォルト: true） |
| `deviceUdid` | string? | 対象シミュレーターUDID |

### create_test_case

新規テストケースを作成し、オプションでBaselineも同時に取得します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `name` | string | テストケースID（ディレクトリ名） |
| `displayName` | string? | 表示名 |
| `description` | string? | 説明 |
| `steps` | array? | シナリオステップ |
| `createBaselines` | boolean? | シナリオ実行してBaselineを取得（デフォルト: false） |
| `deviceUdid` | string? | 対象シミュレーターUDID |
| `snapdriveDir` | string? | .snapdriveディレクトリのパス |

**checkpointアクションの種類:**
- `checkpoint`: 現在の画面のみキャプチャ
- `full_page_checkpoint`: スクロールして全体をキャプチャ
- `smart_checkpoint`: **推奨** - スクロールViewを自動検出して適切な方法を選択
