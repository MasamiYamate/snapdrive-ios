# 使い方ガイド

## ワークフロー概要

SnapDriveでのテストは以下の流れで行います:

1. **テストシナリオを作成** - Claudeに自然言語で指示してシナリオを構築
2. **Baselineを保存** - 正しい状態のスクリーンショットをリポジトリに含める
3. **差分検証** - 以後の実行でBaselineとの差分を検出

Baselineをリポジトリに含めることで、チーム全体で同じ基準でUIの変更を検証できます。

## Step 1: テストシナリオの作成

Claudeに自然言語でテストしたい内容を伝えます:

```
ログイン機能のテストケースを「login-flow」という名前で作成して。
1. アプリを起動
2. ログインボタンをタップ
3. メールアドレスに "test@example.com" を入力
4. パスワードに "password123" を入力
5. 送信ボタンをタップ
6. ホーム画面が表示されることを確認
```

Claudeは画面を探索しながらシナリオを構築し、`.snapdrive/test-cases/login-flow/scenario.yaml`に保存します。

## Step 2: Baselineの作成

シナリオ作成後、Baselineモードで実行して正しい状態のスクリーンショットを保存します:

```
login-flowテストケースを実行してbaselineを更新して
```

これにより各checkpointのスクリーンショットが`.snapdrive/test-cases/login-flow/baselines/`に保存されます。

**重要**: このbaselineディレクトリをGitリポジトリにコミットしてください。

```bash
git add .snapdrive/
git commit -m "Add login-flow test case with baselines"
```

## Step 3: 差分検証

コード変更後、テストを実行してUIの差分を検出します:

```
login-flowテストケースを実行して
```

Baselineと現在の画面を比較し、差分があればHTMLレポートで確認できます。

## 基本操作

### スクリーンショット

```
シミュレーターのスクリーンショットを撮って
```

### UI要素の確認

```
画面の要素一覧を見せて
```

### タップ操作

```
「ログイン」ボタンをタップして
```

### テキスト入力

```
メールアドレス欄に "test@example.com" を入力して
```

## ビルド&実行

Xcodeスキーム名を指定するだけで、ビルドからアプリ起動まで自動で行います:

```
MyAppスキームをビルドしてiPhone 15で起動して
```

## 次のステップ

- [テストケースの詳細](test-cases.md) - シナリオファイルの書式とアクション一覧
- [CLIでの自動実行](cli.md) - CI/CDでの利用方法
