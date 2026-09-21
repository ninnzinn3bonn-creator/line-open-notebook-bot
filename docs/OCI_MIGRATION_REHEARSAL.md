# OCI移管リハーサル

開発PCからOCIへ、納品時と同じZIP・秘密情報分離・受入れ手順で移管する。PCの`.env`、DB、ログ、一時Tunnel URLはコピーしない。

## 事前条件

- OCI Ampere A1 Ubuntu Arm64、SSH公開鍵
- 本Bot専用Cloudflare Named Tunnel、Bot hostname、管理hostname、Access policy
- OCI専用のLINE、Groq、Google認証情報
- 承認済みKnowledgeとGolden Dataset
- VM外の暗号化バックアップ保管先

## 手順

1. PCで`npm test`、`npm run build`、`npm run images:verify-arm64`、`npm run release:build`を実行する。
2. ZIP、manifest、SHA-256だけをOCIへ転送し、`/opt/line-open-notebook-bot`へ展開する。
3. `sudo DEPLOYMENT_MODE=tunnel bash scripts/bootstrap-server.sh`を実行する。
4. `.env.example`からOCI専用`.env`を作成し、Tunnel tokenを権限600で`secrets/`へ配置する。
5. `doctor.sh`、`deploy.sh`、`install-systemd.sh`を順に実行する。
6. Open NotebookへProviderと承認済みKnowledgeを登録し、モデルrecord IDを`.env`へ設定する。
7. Named TunnelをBot hostname→`edge-router:8080`、管理hostname→`open-notebook:8502`へ接続する。
8. 管理hostnameをCloudflare Accessで管理者だけに限定する。
9. `acceptance-test.sh`を実行後、LINE Webhookを固定Bot hostnameへ切り替える。
10. 通常、対象外、有人停止・復帰、3ラリー、3端末同時、重複Webhook、Timeoutを確認する。
11. OCIを再起動し自動復旧を確認する。暗号化バックアップを取得し、空の別データ領域へ復元する。

## 切替とロールバック

LINE Webhook切替まではPC側Quick Tunnelを維持する。Critical失敗時はWebhookを直前のURLへ戻す。切替時刻以降のイベントIDを記録し、PCとOCIを同時に正本として動かさない。合格後にPC側BridgeとQuick Tunnelを停止する。

## 証跡

Git revision、ZIP SHA-256、image digest、実行日時、担当者、Health、LINE E2E、Access拒否、再起動、復元結果を`TEST_REPORT.md`へ記録する。秘密値と顧客メッセージ本文は記録しない。
