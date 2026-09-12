# ConoHa VPS 4GB PoCセットアップ

## 採用構成

- ConoHa VPS 4GB、4 vCPU、100GB SSD、GPUなし
- Ubuntu LTS
- Docker Engine + Docker Compose plugin
- CaddyによるHTTPS
- Open Notebook 1.14.0、SurrealDB v2、LINE Bridge、SQLite
- Gemini/Groq等の外部AI API

## VPS作成時

1. ConoHa側で4GB VPSとUbuntu LTSを選択する。
2. SSH公開鍵認証を設定する。
3. セキュリティグループではSSH、TCP 80、TCP/UDP 443だけを許可する。
4. DNSのAレコードをVPSのIPv4アドレスへ向ける。
5. SurrealDB 8000、Open Notebook 5055/8502、Bridge 3001は外部公開しない。

## 初期化

リポジトリをVPSへ取得した後に実行する。

```bash
sudo bash scripts/bootstrap-conoha.sh
sudo chown -R "$USER":"$USER" /opt/line-open-notebook-bot
sudo usermod -aG docker "$USER"
```

一度SSHを切断して再接続し、`docker version`と`docker compose version`を確認する。

## 秘密情報

```bash
cd /opt/line-open-notebook-bot
cp .env.example .env
chmod 600 .env
```

次を実値へ変更する。

- `PUBLIC_HOST`
- `OPEN_NOTEBOOK_ENCRYPTION_KEY`
- `OPEN_NOTEBOOK_PASSWORD`
- `SURREAL_PASSWORD`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

暗号鍵とパスワードは長いランダム値にする。AI ProviderキーはOpen Notebook UIから登録する。

## 起動

```bash
bash scripts/deploy-production.sh
```

確認項目:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
curl -fsS "https://${PUBLIC_HOST}/bridge-health"
curl -fsS "https://${PUBLIC_HOST}/api/config"
```

ブラウザで`https://${PUBLIC_HOST}`を開き、Open Notebookのパスワード認証を確認する。Caddyが証明書を取得するため、起動前にDNSがVPSを指しており、80/443番ポートへ到達できる必要がある。

## LINE接続前の順序

1. Open Notebookの`/health`、`/docs`、`/openapi.json`を確認する。
2. `openapi/openapi.json`を保存し、採用イメージのDigestを記録する。
3. AI ProviderとEmbeddingを登録し、Connection Testを成功させる。
4. 少数の承認済みQ&Aを投入し、処理・Embedding・検索を確認する。
5. 実OpenAPIに合わせて`OpenNotebookProvider`を実装・検証する。
6. `ANSWER_PROVIDER=open-notebook`へ変更する。

## 確認待ちキュー

`INTERNAL_ADMIN_TOKEN`に十分長いランダム値を設定する。確認待ちの顧客発話を含むため、`/internal/*`を公開リバースプロキシの経路へ含めない。管理操作はVPS内部または認証済み管理経路から行う。

```http
GET /internal/reviews?status=pending&limit=50
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>
```

```http
POST /internal/reviews/{id}/decision
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>
Content-Type: application/json

{"decision":"knowledge_missing","note":"FAQ追加候補"}
```

`decision`は`in_scope`、`out_of_scope`、`knowledge_missing`のいずれかとする。同じreviewは1回だけ確定でき、再確定要求はHTTP 409になる。確定内容は`review_decision_history`にも追記する。

## 有人移管キュー

明示的な有人希望と、予約確定・返金確定などAIが確定してはいけない要求は、Open Notebookを呼ぶ前に`handoff_requests`へ保存する。実際の転送機能が未接続の間は、設定済み連絡先への案内だけを返す。

```http
GET /internal/handoffs?status=pending&limit=50
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>
```

```http
POST /internal/handoffs/{id}/resolve
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>
Content-Type: application/json

{"note":"電話対応済み"}
```

案内文と連絡先は`HUMAN_HANDOFF_ANSWER_TEXT`、`HUMAN_HANDOFF_PHONE`、`HUMAN_HANDOFF_HOURS`、`HUMAN_HANDOFF_CHAT_URL`で設定する。未設定の電話番号やURLは回答へ表示しない。
7. LINE DevelopersのWebhook URLを`https://${PUBLIC_HOST}/webhooks/line`へ設定する。

MockのままLINE本番アカウントへ接続しない。
