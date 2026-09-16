# 納品・移管ランブック

## 目的

Windows開発PCのDocker Desktopや一時Tunnelに依存せず、Ubuntu上へ同じ構成を再現し、担当者が診断・復元できる状態で引き渡す。正式構成はCloudflare Named Tunnelを使う`tunnel`モードとする。`direct`モードはVPSが80/443を直接公開する代替構成である。

## 納品物

- Git revisionから生成したZIPとSHA-256
- リリースmanifest
- Docker Composeと固定image digest
- `.env.example`
- 展開、診断、受入れ、バックアップ、復元スクリプト
- 要件定義、セキュリティレビュー、テスト報告

`.env`、API key、Tunnel token、DB、ログ、会話履歴、実店舗の非公開データ、生成済み評価結果は納品ZIPへ含めない。

## 新規Ubuntuへの展開

```bash
unzip line-open-notebook-bot-<revision>.zip -d /opt/line-open-notebook-bot
cd /opt/line-open-notebook-bot
sudo DEPLOYMENT_MODE=tunnel bash scripts/bootstrap-server.sh
cp .env.example .env
chmod 600 .env
mkdir -p secrets
install -m 600 /dev/null secrets/cloudflare-tunnel-token
# .envとsecretへクライアント所有の実値を設定
DEPLOYMENT_MODE=tunnel bash scripts/doctor.sh
DEPLOYMENT_MODE=tunnel bash scripts/deploy.sh
sudo DEPLOYMENT_MODE=tunnel bash scripts/install-systemd.sh
DEPLOYMENT_MODE=tunnel bash scripts/acceptance-test.sh
```

## 日常操作

```bash
DEPLOYMENT_MODE=tunnel bash scripts/healthcheck-oci.sh
DEPLOYMENT_MODE=tunnel bash scripts/diagnose.sh
sudo systemctl restart line-open-notebook-bot
sudo systemctl status line-open-notebook-bot
```

`diagnose.sh`は秘密値や顧客メッセージを表示せず、コンテナ状態、Health、再起動回数だけを表示する。

## 更新

1. VM外暗号化バックアップを取得する。
2. 新しいリリースZIPのSHA-256を検証する。
3. `.env`と`secrets/`を新しいディレクトリへ安全に再設定する。
4. `doctor.sh`を通す。
5. `deploy.sh`を実行する。
6. `acceptance-test.sh`とLINE実端末試験を行う。
7. 問題時は旧revisionへ戻し、同じバックアップを復元する。

## 障害時の判断

| 症状 | 最初の確認 |
|---|---|
| LINEが無応答 | `diagnose.sh`、Tunnel、LINE登録Webhook |
| 管理画面だけ開かない | Cloudflare Access policy、Open Notebook Health |
| 緊急回答だけ返る | Open Notebook、Groq rate limit、外部通信 |
| 二重返信 | Official Account Managerの応答メッセージ、Webhook event ID |
| 再起動後に停止 | systemd、Docker enable、コンテナrestart count |
| データ消失 | サービス停止、書込み禁止、VM外バックアップから別領域へ復元 |

## 移管合格条件

- 空のUbuntu VMへ納品ZIPだけから展開できる。
- OS再起動後に全コンテナが自動復旧する。
- Cloudflare Access未認証者は管理画面へ入れない。
- LINEの通常回答、対象外、有人案内、3ラリーが成功する。
- 同じWebhookを再送しても返信は1回だけである。
- VM外バックアップから新規データ領域へ復元できる。
- クライアント管理者が`doctor.sh`と`diagnose.sh`の結果を読める。
- 開発者所有のLINE、Cloudflare、AI認証情報を失効できる。
