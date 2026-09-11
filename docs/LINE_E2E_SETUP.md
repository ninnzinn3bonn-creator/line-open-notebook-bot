# LINE E2E設定・検証手順

## 事前準備

1. LINE公式アカウントを作成し、Messaging APIを有効にする。
2. LINE Developersコンソールの対象チャネルでChannel secretを確認する。
3. Channel access token v2.1、またはPoC用の長期チャネルアクセストークンを発行する。
4. 実値はGitへ追加せず、実行環境の`.env`だけへ設定する。

```dotenv
LINE_CHANNEL_SECRET=<Channel secret>
LINE_CHANNEL_ACCESS_TOKEN=<Channel access token>
```

ローカルE2EではBridgeへ到達する一時HTTPS URLを用意し、次も設定する。VPSでは`PUBLIC_HOST`を使用するため不要。

```dotenv
LINE_WEBHOOK_BASE_URL=https://<temporary-public-host>
```

## LINE Developersコンソール

Messaging API設定でWebhook URLを次へ設定する。

```text
https://<public-host>/webhooks/line
```

- Webhookの利用を有効にする。
- コンソールの「検証」を実行し、成功を確認する。
- LINE Official Account Manager側の応答メッセージとAI応答メッセージは停止し、二重返信を防ぐ。
- テスト担当者が公式アカウントを友だち追加する。

Bridgeは受信した生bodyを変更する前に`x-line-signature`をChannel secretで検証し、ジョブ登録後すぐHTTP 200を返す。回答生成とLINE返信はワーカーが非同期で行う。

## 自動事前確認

Bridgeを起動した状態で次を実行する。

```powershell
npm run line:preflight
```

次を秘密値を表示せずに検証する。

- Channel secretとaccess tokenの設定
- Access tokenによるBot情報取得
- LINE側へ登録されたWebhook URLと有効状態
- 署名付き空Webhookに対するHTTP 200

## 実機シナリオ

各試験でLINE送信時刻、Bridge受信時刻、LINE API受付時刻、端末表示時刻を記録する。

1. 通常回答: `営業時間は何時までですか？`
2. Follow-up: 続けて`土曜日も同じですか？`
3. 対象外: `PythonでHello Worldと書いて`
4. 確認待ち: `おすすめの商品は何ですか？`
5. 同一メッセージのWebhook再送で二重返信しないこと
6. 3ユーザー同時送信と10件Burst
7. Open Notebook停止時のTimeout、再試行、緊急回答
8. Bridge再起動後に処理中ジョブが回収されること

LINE APIがリクエストを受け付けた時刻と、端末へ表示された時刻は別に記録する。PoCレポートには成功件数、失敗件数、平均・中央値・p95、再試行回数を記載する。
