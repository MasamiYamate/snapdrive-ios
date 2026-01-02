# Fastlane統合

[English](fastlane.md) | [日本語](fastlane.ja.md)

SnapDriveのビジュアルリグレッションテストをFastlaneワークフローに統合します。

## セットアップ

### 1. SnapDriveのインストール

プロジェクトに追加するか、グローバルにインストール:

```bash
npm install -g snapdrive-mcp
```

### 2. カスタムレーンの作成

`Fastfile`に追加:

```ruby
desc "SnapDriveビジュアルリグレッションテストを実行"
lane :visual_tests do
  # シミュレーターを起動
  sh("xcrun simctl boot 'iPhone 15' || true")

  # アプリをビルド
  build_app(
    scheme: "YourApp",
    configuration: "Debug",
    destination: "generic/platform=iOS Simulator",
    derived_data_path: "./build",
    skip_archive: true,
    skip_codesigning: true
  )

  # シミュレーターにアプリをインストール
  app_path = Dir["./build/Build/Products/Debug-iphonesimulator/*.app"].first
  sh("xcrun simctl install booted '#{app_path}'")

  # SnapDriveテストを実行
  sh("npx snapdrive run --all --snapdrive-dir ./.snapdrive")
end

desc "SnapDriveベースラインを更新"
lane :update_baselines do
  sh("xcrun simctl boot 'iPhone 15' || true")

  build_app(
    scheme: "YourApp",
    configuration: "Debug",
    destination: "generic/platform=iOS Simulator",
    derived_data_path: "./build",
    skip_archive: true,
    skip_codesigning: true
  )

  app_path = Dir["./build/Build/Products/Debug-iphonesimulator/*.app"].first
  sh("xcrun simctl install booted '#{app_path}'")

  sh("npx snapdrive run --all --update-baselines --snapdrive-dir ./.snapdrive")
end
```

## GitHub ActionsとFastlane

```yaml
name: Visual Regression Tests

on:
  pull_request:
    branches: [main]

jobs:
  visual-tests:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4

      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.2'
          bundler-cache: true

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install fb-idb
        run: pip install fb-idb

      - name: Run Visual Tests
        run: bundle exec fastlane visual_tests
        continue-on-error: true

      - name: Upload Test Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: snapdrive-report
          path: results/*/report.html
```

## Bitrise統合

`bitrise.yml`にScriptステップを追加:

```yaml
workflows:
  visual-tests:
    steps:
      - activate-ssh-key@4: {}
      - git-clone@8: {}
      - xcode-build-for-simulator@0:
          inputs:
            - scheme: YourApp
            - simulator_device: iPhone 15
      - script@1:
          title: Run SnapDrive Tests
          inputs:
            - content: |
                #!/bin/bash
                set -ex
                pip install fb-idb
                npm install -g snapdrive-mcp
                xcrun simctl boot "iPhone 15" || true
                npx snapdrive run --all
      - deploy-to-bitrise-io@2:
          inputs:
            - deploy_path: results/*/report.html
```

## 応用: カスタムレポート

テスト完了後にSlackへ結果を送信:

```ruby
desc "Slack通知付きビジュアルテスト"
lane :visual_tests_with_notification do
  begin
    visual_tests
    slack(
      message: "✅ ビジュアルリグレッションテスト成功",
      success: true,
      slack_url: ENV["SLACK_WEBHOOK_URL"]
    )
  rescue => e
    slack(
      message: "❌ ビジュアルリグレッションテスト失敗",
      success: false,
      slack_url: ENV["SLACK_WEBHOOK_URL"],
      attachment_properties: {
        fields: [
          { title: "エラー", value: e.message }
        ]
      }
    )
    raise e
  end
end
```

## Tips

### 並列テスト

Fastlaneの`parallel`ブロックで複数のテストケースを並列実行:

```ruby
lane :parallel_visual_tests do
  test_cases = ["login-flow", "settings-view", "profile-screen"]

  test_cases.each do |test_case|
    sh("npx snapdrive run #{test_case} &")
  end

  # すべてのテストの完了を待機
  sh("wait")
end
```

### デバイスマトリクス

複数のシミュレーターでテスト:

```ruby
lane :multi_device_tests do
  devices = ["iPhone 15", "iPhone 15 Pro Max", "iPad Pro (12.9-inch)"]

  devices.each do |device|
    sh("xcrun simctl boot '#{device}' || true")
    sh("npx snapdrive run --all --device $(xcrun simctl list devices | grep '#{device}' | grep -oE '[A-F0-9-]{36}')")
  end
end
```

### ベースライン管理

mainブランチでのみベースラインを更新:

```ruby
lane :ci_visual_tests do
  if ENV["CI"] && git_branch == "main"
    update_baselines
  else
    visual_tests
  end
end
```
