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
- 友だち追加時の「あいさつメッセージ」だけを有効にし、回答可能な問い合わせ例と、内容によっては案内できない旨を最初に知らせる。通常メッセージへの「応答メッセージ」は無効のままにする。
- テスト担当者が公式アカウントを友だち追加する。

PoCのあいさつメッセージ:

```text
友だち追加ありがとうございます。
こちらでは、営業時間、定休日、アクセス、取扱商品、予約・キャンセルなど、店舗に関するお問い合わせをご案内します。
質問をそのままメッセージでお送りください。内容によっては、このLINEではご案内できない場合があります。
```

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

## 納品時のLINEアカウント切替

PoCでは開発者が所有する検証専用のLINE公式アカウントとMessaging APIチャネルを使用する。本番納品では、クライアントをサービス提供者として扱い、クライアント自身が管理するLINEヤフーBusiness ID、LINE公式アカウント、LINE Developersプロバイダーを使用する。

Messaging APIチャネルは作成後に別のプロバイダーへ移動できず、LINE公式アカウントとの連携も解除できない。このため、PoCチャネルやその認証情報を本番へ移管しない。クライアントが既存の適切なプロバイダーを持つ場合はそれを選択し、持たない場合はクライアント名義で新規作成してからMessaging APIを有効にする。

切替手順:

1. クライアント管理者がクライアント名義のプロバイダーとLINE公式アカウントを準備する。
2. クライアント管理者がその公式アカウントでMessaging APIを有効にし、対象プロバイダーへ一度だけ連携する。
3. クライアント管理者がChannel secretとChannel access tokenを発行し、Gitや納品資料を経由せず、VPSの秘密情報へ直接設定する。
4. 本番VPSの`LINE_CHANNEL_SECRET`と`LINE_CHANNEL_ACCESS_TOKEN`を差し替え、Bridgeを再起動する。
5. LINE Developersで本番Webhook URLを`https://<public-host>/webhooks/line`へ設定し、Webhookを有効化して検証を成功させる。
6. Official Account Managerの応答メッセージとAI応答メッセージを停止し、Bridgeとの二重返信を防ぐ。
7. `npm run line:preflight`を実行し、Bot情報、登録Webhook、有効状態、署名検証を確認する。
8. クライアント端末で通常回答、対象外回答、有人案内、3ラリー文脈、Timeout時の緊急回答を再試験する。
9. クライアント管理者へLINE Developersのプロバイダー権限とチャネル管理権限、Official Account Managerの管理権限があることを確認する。
10. PoC用のChannel secretとaccess tokenを失効させ、PoC環境の`.env`と実行データを削除する。

プロバイダー単位でLINE user IDが変わるため、PoCで取得したuser ID、会話履歴、ジョブ、有人移管記録を本番へ移さない。移行対象はBridge、Open Notebookの承認済みナレッジ、プロンプト設定、評価データセット、構成手順とし、本番認証情報と実利用データはクライアント環境で新しく生成する。
