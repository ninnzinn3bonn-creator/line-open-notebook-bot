# Cloudflare常時稼働構成への再設計案

作成日: 2026-09-11

> 状態: 2026-09-11の方針決定により保留。PoCは`REQUIREMENTS_v0.5.md`のVPS構成へ戻し、本案は採用しない。VPS候補と費用は`VPS_COST_COMPARISON.md`を参照する。

## 結論

CloudflareをLINE Botの常時稼働基盤にすることは可能。ただし、VPS用Docker ComposeをWorkersへ移す方式ではない。推奨案はOpen Notebook/SurrealDB/ローカルSQLiteを本番構成から外し、Cloudflare Workers、Durable Objects、D1、Vectorize、AI Gatewayで同じ業務目的を再構成する方式とする。

この変更はホスティング先の変更に留まらず、要件第0章の「Open NotebookをKnowledge/RAG/回答生成基盤として利用する」という基本方針を変更する。現在のv0.5は上書きせず、本案の採用決定後にv0.6として書き直す。

## 選択肢

| 案 | 構成 | 利点 | 主な問題 | 判断 |
|---|---|---|---|---|
| A | Cloudflare WorkerをWebhook入口にし、Open NotebookはVPS等に残す | 現行要件とOpen Notebook UIを維持しやすい | Open Notebook用の常設サーバーが残る | Open Notebook必須なら採用候補 |
| B | Open NotebookをCloudflare Containers、DBを外部SurrealDBで運用 | DockerアプリをCloudflare側へ寄せられる | Containersは現時点でβ、停止後のローカルディスクは初期化される。外部DB、ファイル永続化、複数ポート、起動時間の追加検証が必要 | 本番の第一候補にしない |
| C | Workers + Durable Objects + D1 + VectorizeでRAGを実装 | VPS不要。LINE処理・永続状態・検索をCloudflare上で構成できる | Open Notebook UIとAPIを失うため、Knowledge更新機能を小さく作る必要がある | 推奨 |

Cloudflare Containersはリクエスト等で起動し、非活動時に停止できる仕組みで、ディスクは停止後に保持されない。したがってOpen NotebookとSurrealDBをそのまま1つの永続サーバーとして置く用途には適合しにくい。[Containers lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/)

## 推奨構成

```text
LINE User
   │
   ▼
LINE Messaging API
   │ POST /webhooks/line
   ▼
Cloudflare Worker: ingress
   ├─ Raw body署名検証
   ├─ Event形式検証
   ├─ UserMailbox Durable Objectへ受付
   ├─ 即時の受付Reply
   └─ HTTP 200
          │
          ▼
UserMailbox Durable Object（LINE userIdごと）
   ├─ webhookEventId重複排除
   ├─ 同一ユーザーの受信順
   ├─ Job/送信状態の永続化
   └─ 先頭Jobだけを回答Queueへ送る
          │
          ▼
Cloudflare Queue（回答処理、最大同時数を制御）
   │ at-least-once
   ▼
Worker: answer-consumer
   ├─ UserMailboxへ処理権を確認
   ├─ 固定Embeddingで質問をベクトル化
   ├─ Vectorizeでactive Knowledge Revisionを検索
   ├─ D1から正式なFAQ本文を取得
   ├─ AI Gateway経由で選択モデルを呼出し
   ├─ 回答・根拠・Latency・Usageを保存
   └─ LINE Push（永続化したretry keyを使用）
          │
          ▼
UserMailboxが完了を確定し、次JobをQueueへ送る
```

Cloudflare Queuesは少なくとも1回の配送で、順序を保証しない。そのためQueueを同一ユーザー順序の根拠にしない。[Delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) [How Queues works](https://developers.cloudflare.com/queues/reference/how-queues-works/)

Durable Objectは1ユーザーを調整単位とする。単一スレッドと永続ストレージで、ユーザーごとの重複排除と順序を確定する。異なるユーザーは異なるObjectなので並列処理できる。[Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)

## LINE応答方式

Webhook接続内で回答生成を待たない方針は維持する。受付成功後にReply tokenで「確認しています」等の短い中間返信を直ちに送り、回答はPushで送る。これによりQueue待ちやAIの再試行をReply token期限から切り離す。

受付Replyも外部API送信なので、送信状態をUserMailboxへ保存する。回答Pushは初回呼出し前にUUIDを作成・保存し、同じ送信の再試行で同じ`X-Line-Retry-Key`を使用する。通信結果不明は失敗と区別し、無条件に新しい送信を作らない。

受付Replyを毎回送るため、最終回答まで常に2メッセージになる。このUXとLINE側の通数・料金はPoCで確認する。将来、十分速い回答のみ1回で返す最適化は別変更とし、最初の信頼性設計へ混ぜない。

## Cloudflare上のデータ責任

### Durable Object SQLite

ユーザー単位で以下を保持する。

- webhookEventId、受信時刻、質問、Reply tokenの使用状態
- Job状態、試行回数、処理リース、回答、Push retry key、送信結果
- 同一ユーザーの次に処理すべきJob

モジュール変数を永続状態に使わない。Queueの重複配送時も同じeventIdを再処理しない。Queue送信成功直後にObjectが停止しても、`queued`状態とQueue側のat-least-once配送から復旧できるようにする。Queue送信結果が不明な場合の重複Wakeは許容し、Job処理は冪等にする。

### D1

共有の業務データを保持する。

- `knowledge_revisions`
- `faqs` / `knowledge_chunks`
- `model_profiles`
- `prompt_revisions`
- `evaluation_runs` / `evaluation_results`
- 運用確認用のevent/job集計（必要な項目だけ）

D1をSurrealDBの代替としてOpen Notebookへ接続するのではない。Open Notebookを外した新しい回答サービスがD1を直接使用する。バイナリファイルや大きな原資料はD1へ格納せず、必要な場合だけR2へ置く。D1にはサイズ・実行時間等の上限があるため、FAQ本文と状態・索引参照を中心にする。[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

### Vectorize

固定したEmbedding Modelで作成したKnowledge chunkだけを保存する。ベクトルIDからD1のchunk IDへ戻し、回答に渡す正式本文はD1から取得する。長い本文をVectorize metadataだけで復元しない。

Knowledge Revisionごとにnamespaceを分け、検索時はactive revisionのnamespaceだけを指定する。Upsert/Deleteは非同期で検索反映まで時間差があるため、新Revisionを投入した直後にactiveへ切り替えない。[Vectorize client API](https://developers.cloudflare.com/vectorize/reference/client-api/)

### SecretsとAI Gateway

LINE Channel Secret/Access Token、Groq/GeminiキーはWorkers Secretsで管理する。D1、ソースコード、ログへ平文保存しない。

Groq、Google AI Studio等の回答モデルはAI Gateway経由で呼び出せる。モデルProfileにはprovider、model、embedding revision、prompt revisionを保存する。旧Universal Endpointは非推奨なので、新規実装ではProvider endpointまたはOpenAI互換endpointを使う。[AI Gateway providers](https://developers.cloudflare.com/ai-gateway/usage/providers/) [Groq integration](https://developers.cloudflare.com/ai-gateway/usage/providers/groq/)

## Knowledge更新

Open Notebook UIがなくなるため、PoCには最低限の更新経路が必要になる。初期は認証済み管理APIまたはCLIでJSONを投入し、本番段階でCloudflare Access配下の小さな管理画面を追加する。

更新は次の順にする。

```text
JSON validation
  → D1へdraft revision作成
  → 本文を決定的にchunk化
  → 固定Embedding Modelでベクトル生成
  → Vectorizeの新namespaceへupsert
  → 反映待ち・代表検索確認
  → Golden Regression Test
  → Human Review
  → active revisionを切替
  → 旧revisionを一定期間後に削除
```

投入や再Embeddingは長い処理になり得るため、通常のWebhook WorkerではなくCloudflare Workflowで実行する。Workflowの各段階を冪等にし、途中再実行で重複chunkを増やさない。WorkersのHTTP処理、Queue consumer、Durable Object alarmには実行特性の違いがあるため、長いKnowledge更新とLINEの回答経路を分離する。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## 回答生成とモデル回帰

AnswerProviderの概念は維持する。

```text
MockAnswerProvider
CloudflareRagAnswerProvider
```

本番WorkerとEvaluation Runnerは同じ検索・Prompt構築・モデルProfileを使う。Evaluation専用endpointでは認証を必須にし、指定したKnowledge RevisionとModel Profileを明示して実行する。本番のactive modelを評価実行で変更しない。

比較時に固定する項目:

- Knowledge Revision
- Chunking Revision
- Embedding Provider/Model/Dimensions
- Vectorize index/namespace
- Retrieval設定（topK、score threshold等）
- Prompt Revision
- 回答フォーマット
- Evaluation Dataset Revision

変更する項目は回答Language Modelだけとする。VectorizeのEmbedding Modelを変える場合は新しいindexを作り、Language Model比較と分離する。人間評価、Critical Failure、捏造率、Latency、取得可能なUsage/Costを保存する既存方針は維持する。

## 現行実装への影響

| 現行 | Cloudflare案 |
|---|---|
| Express server | Workers-native HTTP handler（Hono等は選択可） |
| SQLite file | Durable Object SQLite + D1 |
| SQLite polling worker | Queue consumer + UserMailbox Durable Object |
| OpenNotebookProvider | CloudflareRagAnswerProvider |
| Open Notebook Sources/Notes | D1 canonical FAQ/chunks + optional R2 originals |
| Open Notebook Embedding | Embedding API + Vectorize |
| Open Notebook Model Registry | D1 model profiles + Workers Secrets + AI Gateway |
| Docker Compose production | Wrangler configuration / Cloudflare resources |
| Reverse proxy/HTTPS | Workers route/custom domain |
| VPS backup | D1 Time Travel/export、R2 versioning、設定とDatasetのGit履歴 |

現在作成済みのEvaluation Schema、Golden Dataset方針、AnswerProvider型、Mockテスト、回帰基準は再利用できる。Express起動、better-sqlite3、Docker Compose、Open Notebook API調査を前提にした部分は置換対象となる。

## PoCの改訂完了条件案

- Cloudflare開発・検証環境を作成
- LINE署名検証とWebhook受付
- Durable Objectでevent重複排除・同一ユーザー順序維持
- Queueの重複配送を含む冪等処理
- D1へ実Q&Aを登録
- 固定EmbeddingでVectorize検索成功
- AI Gateway経由で2モデル以上へ接続
- 30〜50問以上のGolden Datasetと人間評価
- Baseline・モデル比較レポート
- LINE E2E
- 同時3ユーザー、10件Burst、同一ユーザー3連投
- Timeout、429、Queue retry、DLQまたは終端失敗記録
- Worker/DO再起動相当の復旧試験
- Knowledge新Revisionの投入・回帰・切替試験

## 決定が必要な一点

Open Notebookの利用が提出条件・契約条件であるかを確認する。必須なら案Aを採用し、Cloudflareは公開Webhookと非同期制御を担当する。必須でなく「問い合わせBotの品質と運用」が目的なら案Cへ全面移行する。

案Cを採用する場合、次の作業はv0.6要件定義の作成、現行NodeプロジェクトのWorkers向け再構成、Wrangler/D1/Vectorize/Queue/Durable Objectの開発環境作成とする。Docker/WSLのセットアップは不要になる。
