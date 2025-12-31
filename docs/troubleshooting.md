# トラブルシューティング

## "No simulator UDID specified and no booted simulator found"

シミュレーターが起動していません。

```bash
# シミュレーターを起動
xcrun simctl boot "iPhone 15"
open -a Simulator
```

または、Claudeに「iPhone 15シミュレーターを起動して」と指示してください。

## "idb describe-all failed"

fb-idbがインストールされていないか、シミュレーターに接続できていません。

```bash
# fb-idbをインストール
pip install fb-idb

# 動作確認
idb connect <simulator-udid>
idb ui describe-all
```

## ビルドエラー

Xcodeのコマンドラインツールが古い可能性があります。

```bash
sudo xcode-select --install
```

## "Element not found"

指定したラベルの要素が見つかりません。

1. `describe_ui`で現在の画面の要素一覧を確認
2. ラベルの完全一致/部分一致を確認
3. 要素が画面に表示されているか確認（スクロールが必要な場合も）

## スクリーンショット比較で常に差分が出る

動的なコンテンツ（時刻、アニメーションなど）が含まれている可能性があります。

- `tolerance`パラメータで許容誤差を設定
- checkpointの前に`wait`で安定するまで待機
- 動的な部分を避けた比較を検討

## HTMLレポートが生成されない

`updateBaselines: true`の場合、レポートは生成されません（比較ではなく保存モードのため）。

比較モードで実行してください:
```
login-flowテストケースを実行して
```
