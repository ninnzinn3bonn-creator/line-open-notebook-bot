# LINE × Open Notebook 問い合わせBot

Open NotebookをKnowledge/RAG/回答生成基盤として使うLINE問い合わせBotのPoCです。要件の正本は [docs/REQUIREMENTS_v0.5.md](docs/REQUIREMENTS_v0.5.md) です。

## 現在の状態

初回セットアップ中です。Open Notebook 1.14.0をDocker Composeで起動する構成、BridgeのMock回答とHealth endpoint、SQLite schema、評価Dataset schemaとRunner骨格を用意しています。Docker Desktopは導入済みですが、WSL 2の有効化とWindows再起動が必要です。実AI接続と回答精度評価は、Open Notebook起動後に実APIを確認し、認証情報と実Q&Aを登録してから行います。

## ローカル起動

1. [docs/SETUP.md](docs/SETUP.md)に従ってWSL 2を有効化し、Docker Desktopを起動する。
2. `.env.example`を`.env`へコピーし、`OPEN_NOTEBOOK_ENCRYPTION_KEY`と`SURREAL_PASSWORD`を設定する。
3. `docker compose pull`、`docker compose up -d`を実行する。
4. `http://localhost:5055/health`と`http://localhost:8502`を確認する。
5. `npm install`、`npm test`、`npm run dev`を実行する。

Open Notebookの認証情報はUIのManage → Modelsから登録し、Connection Testが成功したモデルだけを評価対象にします。APIキーをGitへ保存しません。

OpenAPIの保存と確認:

```powershell
npm run inspect:openapi
```

評価Runnerの現時点の骨格確認:

```powershell
npm run eval
```

## バージョン固定

Open Notebookは`1.14.0`を使用します。`latest`タグは使用しません。SurrealDBは公式v1.14.0 Composeに合わせて`v2`を使用し、初回Pull後に実Digestを記録して以降の比較を固定します。
