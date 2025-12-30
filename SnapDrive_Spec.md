# 仕様書：iOS Simulator Snapshot Runner（最小実装 / SnapDrive系）

## 1. 目的
iOS Simulator 上でアプリを起動し、**アクセシビリティID整備なし**で以下を自動化する。

- `idb ui describe-all` で画面要素情報を取得
- ラベル等の条件で要素探索 → **Frame中心を座標タップ**
- `xcrun simctl io booted screenshot` でスクリーンショット取得
- baseline画像との差分（画像diff）を出してテスト結果を判定

## 2. 動作環境・前提
- macOS（開発者マシン / CIは後回し）
- Xcode / iOS Simulator が利用可能
- Homebrew で `idb-companion` を導入できること（facebook/fb）
- `xcrun simctl` が利用可能
- 実行対象は **Simulator（booted）** を基本とする
- 対象アプリは `.app`（最低限）または `.ipa` をインストールして起動できること

## 3. 非目標（今回やらない）
- 本番レベルの安定性（全UI要素を確実に取る、TabBar欠落等への完全対処）
- 実機対応
- 並列実行
- 高度な画像認識（テンプレマッチやOCRは保険として将来追加）

## 4. システム構成

### 4.1 CLIツール（推奨：Python）
- 言語：Python 3.11+（標準ライブラリ＋最小依存）
- 依存（候補）
  - Pillow（PNG読み込み/差分作成）
  - numpy（任意：高速化したければ）
  - pyyaml（シナリオをYAMLにするなら）
- CLI名：`snapdrive`（仮）

### 4.2 外部コマンド
- `idb ui describe-all`（アクセシビリティツリーをJSONで取得）
- `idb ui tap x y` / `idb ui swipe ...` / `idb ui text "..."`（操作）
- `xcrun simctl io booted screenshot <path>`（スクショ）

## 5. ディレクトリ構成
```text
snapdrive/
  snapdrive/              # Python package
    __init__.py
    cli.py                # エントリポイント
    runner.py             # シナリオ実行
    idb.py                # idb呼び出しラッパ
    simctl.py             # simctl呼び出しラッパ
    ax_tree.py            # describe-all JSON解析 & 要素検索
    diff.py               # 画像diff & レポート生成
    models.py             # dataclass定義
    errors.py
  scenarios/
    sample.yaml
  baselines/
    default/
      detail.png
  results/
    <timestamp>/
      screenshots/
      diffs/
      ax/
      report.json
      report.txt
  pyproject.toml
  README.md
```

## 6. シナリオ定義（YAML推奨）

### 6.1 例
```yaml
app:
  bundleId: "com.example.MyApp"
  launchArgs: ["-UITestMode", "1"]
  launchEnv: {}

settings:
  deviceScale: 1.0         # 座標補正用（将来/必要に応じて）
  defaultTimeoutSec: 8
  snapshotDelaySec: 0.2

steps:
  - waitFor:
      match:
        type: "label"
        value: "ホーム"
      timeoutSec: 8

  - tap:
      match:
        type: "label"
        value: "詳細へ"

  - snapshot:
      name: "detail"

  - tap:
      match:
        type: "label"
        value: "保存"

  - snapshot:
      name: "saved"
```

### 6.2 Step種別（最小）
- `waitFor`：指定要素が見つかるまでポーリング
- `tap`：要素を探索して Frame中心をタップ
- `swipe`：固定座標 or 要素基準でスワイプ（最小は固定座標でもOK）
- `text`：キーボード入力（最小は `idb ui text` 直呼び）
- `sleep`：秒数待機
- `snapshot`：スクショ取得 + diff

## 7. 要素探索（describe-all）

### 7.1 入力
- `idb ui describe-all`（JSON出力を採用すること）
- 出力JSONから要素を列挙し、以下を利用する
  - 表示テキスト（label/value/name等）
  - 役割（button / staticText 等）
  - Frame（x, y, width, height）

> JSON構造は環境により揺れる可能性があるため、パースは防御的に行う（キー欠損で落とさない）。

### 7.2 Match条件（最小）
`match` は以下のいずれか：
- `type: "label"` + `value: "<完全一致>"`（最初は完全一致のみ）
- `type: "labelContains"` + `value: "<部分一致>"`（次に実装）
- `type: "predicate"`（将来拡張：roleや複数条件）

### 7.3 タップ座標
- Frame中心 `(x + w/2, y + h/2)` を整数化して `idb ui tap` に渡す
- frame が画面外/ゼロサイズの場合は候補から除外

### 7.4 優先順位
複数候補がある場合（最初は簡易でOK）：
1. roleが button っぽいもの（取得できるなら）
2. 画面中央に近いもの
3. 最初に見つかったもの

最小MVPは「最初の一致」でも可。

## 8. スクリーンショット & diff

### 8.1 取得
- `xcrun simctl io booted screenshot <results>/<run>/screenshots/<name>.png`

### 8.2 baseline
- baselineの探索パス：`baselines/<profile>/<name>.png`
- `--update-baseline` オプション時は、撮ったスクショを baseline にコピーして成功扱い

### 8.3 diff判定
- 最小：ピクセル完全一致
- 次：許容差 `tolerance`（0.0〜1.0）を追加可能にする
- 出力
  - diff画像（差分可視化PNG）：`results/.../diffs/<name>_diff.png`
  - `report.json`：各snapshotの pass/fail、差分率、ファイルパス

## 9. CLI仕様

### 9.1 実行
```bash
snapdrive run scenarios/sample.yaml --profile default
```

### 9.2 オプション（最小）
- `--profile <name>`：baselineプロファイル選択（default）
- `--update-baseline`：baseline更新モード
- `--output <dir>`：結果出力先
- `--verbose`：ログ詳細

## 10. エラーハンドリング
- `idb` / `simctl` が見つからない：わかりやすいメッセージ
- Simulatorがbootedでない：bootを促す or 自動boot（今回は促すでもOK）
- 要素が見つからない：`waitFor` timeoutで失敗  
  - 失敗時、現在のスクショとdescribe-all JSONを結果に保存
- diff失敗：baseline無しの場合は失敗（update-baselineを促す）

## 11. ログ・成果物
`results/<timestamp>/`
- `screenshots/*.png`
- `diffs/*_diff.png`
- `ax/*.json`（各step時点のdescribe-allを保存してデバッグ可能に）
- `report.json` / `report.txt`

## 12. 実装優先順位（MVP）
1. CLI `run` でシナリオ読み込み
2. `tap(match: label exact)` 実装（describe-all → 探索 → center tap）
3. `snapshot(name)` 実装（simctl screenshot）
4. baseline比較（完全一致）＋ diff画像生成
5. `waitFor`（ポーリング）
6. `--update-baseline`

---

## Claude Codeへの指示（貼り付け用）
- 上記仕様に沿って Python で実装する
- 外部コマンド呼び出しは `subprocess.run`、stdout/stderrをログに残す
- describe-all JSONは構造が揺れる可能性があるので、防御的にパースする（キーが無い場合に落とさない）
- まず `scenarios/sample.yaml` が動き、snapshot差分まで出る状態をMVPとする
- README に「導入手順」「必要コマンド」「実行例」「baseline更新例」を書く