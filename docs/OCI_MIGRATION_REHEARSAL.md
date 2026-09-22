# OCI移管リハーサル

開発PCからOCIへ、納品時と同じZIP・秘密情報分離・受入れ手順で移管する。PCの`.env`、DB、ログ、一時Tunnel URLはコピーしない。

## 事前条件

- OCI Ampere A1 Ubuntu Arm64、SSH公開鍵
- OCIアカウントへサインインできる管理者と、MFAに使用するスマートフォンの認証アプリ
- 本Bot専用Cloudflare Named Tunnel、Bot hostname、管理hostname、Access policy
- OCI専用のLINE、Groq、Google認証情報
- 承認済みKnowledgeとGolden Dataset
- VM外の暗号化バックアップ保管先

## OCIアカウント作成時の実績メモ

2026-09-22のアカウント作成では、通常のChrome画面で自動入力候補や過去の入力履歴を選択した場合、またはBackspaceを連続して押した場合に、動的フォームの再描画が競合して画面全体が白くなり、入力を継続できない事象が繰り返し発生した。この環境では、Chromeのシークレットモードを使用し、自動入力を使わず各項目を手入力する方法で作成を完了した。

同じ事象が起きた場合は、次の順で対応する。

1. シークレットモード、または拡張機能を無効にした対応ブラウザで最初から開く。
2. 氏名、住所、メールアドレス等はブラウザの自動入力・履歴候補を使わず手入力する。
3. 入力訂正ではBackspaceを連打せず、対象文字列を選択して入力し直す。
4. 白画面になったセッションを使い続けず、`signup.oraclecloud.com`のCookieとキャッシュを消して新しいセッションで再開する。

これは2026-09-22時点の本作業端末における実測上の回避策であり、Oracleの恒久仕様とは扱わない。納品・移管時にも同じ問題が起きる可能性があるため、作業時間に余裕を持たせる。

OCIアカウントの保護と管理操作の認証にはMFAを使用する。アカウント設定中に案内されるスマートフォン用認証アプリを事前にダウンロードし、端末登録と復旧手段の設定を完了してからVM作成へ進む。認証アプリを登録したスマートフォンの紛失・故障に備え、Oracleが提供するリカバリ手段を管理者が保管する。MFAのシード、QRコード、ワンタイムコード、復旧情報はGit、納品ZIP、チャット記録へ保存しない。

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
