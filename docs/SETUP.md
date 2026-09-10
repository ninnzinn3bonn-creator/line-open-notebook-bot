# 開発環境セットアップ

## 必要環境

- Windows 11
- Git
- Node.js 24（現環境で確認済み）
- Docker DesktopとWSL 2

Docker Desktop 4.90.0はインストール済み。WSLが未導入のため、管理者PowerShellで次を実行し、Windowsを再起動する必要がある。

```powershell
wsl --install --no-distribution
```

再起動後にDocker Desktopを起動し、`docker info`が成功することを確認する。

## プロジェクト

`.env`は作成済みでGit管理から除外している。Open Notebookへ本物のProvider認証情報を保存した後は、`OPEN_NOTEBOOK_ENCRYPTION_KEY`を変更・紛失しない。

```powershell
npm install
npm test
npm run build
docker compose config --quiet
docker compose pull
docker compose up -d
npm run inspect:openapi
```

起動先:

- Open Notebook UI: http://localhost:8502
- Open Notebook API: http://localhost:5055
- Bridge: http://127.0.0.1:3001

Docker ComposeはOpen Notebook 1.14.0を指定する。初回Pull後、使用したOpen NotebookとSurrealDBのDigestを記録する。

