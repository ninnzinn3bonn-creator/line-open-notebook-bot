# サーバーセットアップ

開発期間と納品後1か月はOCI Ampere A1＋Cloudflare Tunnelを先行構成とする。以下のConoHa手順は、初月後にVPSへ移行すると判断した場合の代替手順として保持する。

## OCI先行構成

1. Ubuntu Arm64のOCI Ampere A1を作成し、SSH公開鍵認証を設定する。
2. `CLOUDFLARE_PROJECT_SLUG=line-open-notebook-poc`の専用リソース群として、新規Named Tunnel、LINE Webhook用ホスト名、管理用ホスト名を作成する。普段使用している既存Tunnelへ追加しない。管理用ホスト名を公開する前に本Bot専用Access Self-hosted applicationと管理者限定Allow policyを作成する。
3. LINE Webhook用ホスト名のServiceを`http://edge-router:8080`へ向ける。
4. 管理用ホスト名を`http://open-notebook:8502`へ向け、Cloudflare Accessで管理者だけに制限する。
5. OCIの受信規則は管理用SSHだけに絞り、80/443を公開しない。
6. リポジトリを`/opt/line-open-notebook-bot`へ配置する。

```bash
sudo bash scripts/bootstrap-oci.sh
cp .env.example .env
chmod 600 .env
# .envのCLOUDFLARE_TUNNEL_TOKEN_FILEで指定したファイルにtokenだけを保存
mkdir -p ./secrets
install -m 600 /dev/null ./secrets/cloudflare-tunnel-token
# .envへ実値を設定した後
bash scripts/deploy-oci.sh
```

`docker-compose.oci.yml`では`cloudflared`から`edge-router:8080`へ接続する。`edge-router`が公開するのは`/webhooks/line`と`/health`だけで、Open Notebook、SurrealDB、Bridge管理APIには転送しない。Open Notebook管理画面が必要な場合は、別のCloudflare Access保護ホスト名として設定する。

Cloudflareのリソース名は次のように統一する。Cloudflare製品上に共通の「Project」オブジェクトがない箇所は、この接頭辞と専用リソースによってプロジェクト単位に分離する。

| リソース | 名前の例 |
|---|---|
| Project slug | `line-open-notebook-poc` |
| Named Tunnel | `line-open-notebook-poc-oci` |
| Access Application | `line-open-notebook-poc-admin` |
| Access policy | `line-open-notebook-poc-admin-allow` |
| LINE hostname | `line-bot.example.com` |
| 管理hostname | `line-bot-admin.example.com` |

Tunnel tokenも専用品を使用する。既存プロジェクトのtoken、Service Token、Access Groupは流用しない。

展開前後の境界、拒否試験、残存リスクは[SECURITY_ARCHITECTURE_REVIEW.md](SECURITY_ARCHITECTURE_REVIEW.md)を確認する。

## OCIバックアップと復元

秘密情報とは別に、バックアップ暗号化用の長いランダムパスワードをGit管理外のファイルへ保存する。

```bash
mkdir -p ./secrets
openssl rand -base64 48 > ./secrets/backup-password
chmod 600 ./secrets/backup-password
BACKUP_PASSWORD_FILE=./secrets/backup-password bash scripts/backup-oci.sh /mnt/off-vm-backup
```

バックアップはBridge、Open Notebook、SurrealDBを停止して整合性を取り、Bridge SQLite、Open Notebook data、SurrealDB dataをAES-256で暗号化する。`.env`、Tunnel token、API keyは含めない。生成された`.enc`と`.sha256`をOCI VM外へ保管する。

復元は新しいチェックアウトと同じGit revisionで`.env`と各secretを再設定し、空のデータ領域に対して実行する。

```bash
BACKUP_PASSWORD_FILE=./secrets/backup-password bash scripts/restore-oci.sh /mnt/off-vm-backup/line-open-notebook-bot-YYYYMMDDTHHMMSSZ.tar.gz.enc
```

復元後はHealth、Open NotebookのSource件数、保留中review/handoff、代表質問、LINE重複返信がないことを確認する。暗号化パスワードをバックアップと同じ場所だけに保存しない。

内部サービスと任意の公開Health URLは次で検査できる。監視サービスからの外形監視は別に設定し、このコマンドだけでTunnelの到達性を合格扱いにしない。

```bash
PUBLIC_HEALTH_URL=https://line.example.com/health bash scripts/healthcheck-oci.sh
```

systemd timerまたは監視エージェントから実行する場合は、失敗時だけ運用担当者へ通知する。通知先と監視頻度はMMP要件で確定する。

## 採用構成

- 初月後に移行判断した場合のConoHa VPS 4GB、4 vCPU、100GB SSD、GPUなし
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

明示的な有人希望と、予約確定・返金確定などAIが確定してはいけない要求は、Open Notebookを呼ぶ前に`handoff_requests`へ保存する。最初の1回だけ引継ぎ案内を返し、pending中は同じLINE user IDへのBot返信を停止する。他のユーザーのBot応答は継続する。担当者はLINE公式チャットで返信し、対応完了後に管理APIでresolveする。次の顧客発話からBotが自動復帰する。

```http
GET /internal/handoffs?status=pending&limit=50
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>
```

```http
POST /internal/handoffs/{id}/resolve
Authorization: Bearer <INTERNAL_ADMIN_TOKEN>
Content-Type: application/json

{"note":"LINE公式チャットで対応完了"}
```

案内文と連絡先は`HUMAN_HANDOFF_ANSWER_TEXT`、`HUMAN_HANDOFF_PHONE`、`HUMAN_HANDOFF_HOURS`、`HUMAN_HANDOFF_CHAT_URL`で設定する。未設定の電話番号やURLは回答へ表示しない。

LINE Official Account Managerでチャットと担当者端末の通知を有効にする。Messaging APIのWebhookは有効のまま維持する。LINE公式側の一時手動チャット状態をBridgeの正本にはせず、`handoff_requests.status`を停止・復帰の正本とする。`/internal/*`は公開Webhook hostnameへ露出させない。
7. LINE DevelopersのWebhook URLを`https://${PUBLIC_HOST}/webhooks/line`へ設定する。

MockのままLINE本番アカウントへ接続しない。

## 納品時の所有権

PoC用LINE公式アカウントとMessaging APIチャネルは開発・検証専用とする。Messaging APIチャネルは別プロバイダーへ移動できないため、本番ではクライアント名義のプロバイダーと公式アカウントで新しいチャネルを作成し、VPSのLINE認証情報とWebhook設定を切り替える。権限確認、事前診断、端末E2E、PoC認証情報の失効を含む詳細手順は[LINE_E2E_SETUP.md](LINE_E2E_SETUP.md#納品時のlineアカウント切替)に従う。
