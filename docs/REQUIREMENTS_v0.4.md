# LINE × Open Notebook 問い合わせBot
## PoC・モデル回帰テスト実装要件定義 v0.4

# 0. 本要件の位置付け

本ドキュメントをCodexによる実装のSource of Truthとする。

本システムは、

「LINE問い合わせBotをゼロから構築する」

のではなく、

「Open NotebookをKnowledge/RAG/回答生成基盤として利用し、LINE Messaging APIとのBridgeを構築する」

ことを基本方針とする。

また、AIモデルは固定しない。

モデル変更、Open Notebook更新、Knowledge更新等によって回答品質が低下していないか確認するため、回帰テスト環境をシステムの正式な構成要素として実装する。

コードが動作することと、問い合わせBotとして品質基準を満たすことを別々に評価する。

---

# 1. システム目的

企業のLINE公式アカウントにユーザーが自然文で問い合わせを行うと、企業が管理するFAQ・過去問い合わせ・業務資料等をOpen Notebookから検索し、AIが資料に基づいて回答し、LINEへ返信する。

以下を実現する。

- LINEによる問い合わせ受付
- Open NotebookによるKnowledge管理
- RAGによる根拠付き回答生成
- 複数問い合わせ処理
- Webhook重複防止
- AI Timeout対応
- クライアント自身によるKnowledge更新
- モデル交換
- モデルごとの品質比較
- モデル変更時の回帰テスト
- Open Notebook更新時の回帰テスト
- Knowledge更新時の回帰テスト
- クライアント所有サーバーへの納品

---

# 2. 最終構成

```text
クライアント担当者
        │
        ↓ HTTPS / Browser
┌─────────────────────────────┐
│ Client VPS                  │
│ Ubuntu + Docker Compose     │
│                             │
│ Reverse Proxy               │
│ ├─ Open Notebook UI         │
│ └─ LINE Webhook             │
│                             │
│ Open Notebook               │
│ ├─ Knowledge                │
│ ├─ Search / RAG             │
│ └─ Model Provider           │
│       ├─ Groq               │
│       └─ Gemini             │
│                             │
│ SurrealDB                   │
│                             │
│ LINE Bridge                 │
│ ├─ Signature Verification   │
│ ├─ Duplicate Protection     │
│ ├─ SQLite Queue             │
│ ├─ Worker                   │
│ └─ OpenNotebookProvider     │
└─────────────────────────────┘

LINE User
    ↓
LINE Official Account
    ↓
LINE Messaging API
    ↓
Bridge
    ↓
Open Notebook
    ↓
Selected LLM
    ↓
Bridge
    ↓
LINE Reply
```

---

# 3. 環境

## 開発環境

開発者Windows PC上でDockerを使用する。

```text
Windows
└─ Docker
   ├─ Open Notebook
   ├─ SurrealDB
   └─ LINE Bridge
```

ここで以下を実施する。

- Open Notebook構築
- AI Provider接続
- Knowledge投入
- AI品質評価
- Model Regression Test
- Bridge開発
- Unit Test
- Integration Test

24時間稼働は必要ない。

## LINE PoC環境

開発PC＋Tunnel、または一時VPSを利用してLINEから到達可能にする。

目的は実LINE E2Eテストのみ。

## 本番環境

クライアント所有VPSを利用する。

```text
Ubuntu
2〜4 vCPU
4〜8 GB RAM
50〜100 GB SSD

Docker Compose
├─ Reverse Proxy
├─ Open Notebook
├─ SurrealDB
├─ LINE Bridge
└─ SQLite
```

初期は4GB RAM程度から検証する。

LLM推論をAPI側で行うためGPUは要求しない。

---

# 4. 所有権

本番では原則クライアントが以下を所有する。

```text
VPS
Domain
LINE Official Account
LINE Messaging API
Gemini / Groq Account
API Keys
Knowledge Data
```

開発側の個人アカウントへ恒久依存させない。

---

# 5. Repository

```text
line-open-notebook-bot/
│
├── README.md
├── AGENTS.md
├── .env.example
├── .gitignore
│
├── docker-compose.yml
├── docker-compose.production.yml
│
├── bridge/
│   └── src/
│       ├── line/
│       ├── providers/
│       ├── jobs/
│       ├── db/
│       └── logging/
│
├── evaluation/
│   ├── README.md
│   ├── runner/
│   ├── datasets/
│   │   ├── regression.sample.json
│   │   └── private/
│   ├── configs/
│   ├── baselines/
│   └── results/
│
├── scripts/
│   ├── inspect-openapi.*
│   ├── import-knowledge.*
│   ├── run-regression.*
│   ├── compare-models.*
│   ├── backup.*
│   └── restore.*
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/
    ├── SETUP.md
    ├── SERVER_SETUP.md
    ├── OPEN_NOTEBOOK_SETUP.md
    ├── LINE_SETUP.md
    ├── KNOWLEDGE_FORMAT.md
    ├── MODEL_EVALUATION.md
    ├── REGRESSION_TEST.md
    ├── PRODUCTION_DEPLOYMENT.md
    ├── BACKUP_RESTORE.md
    ├── OPERATIONS.md
    └── TEST_REPORT.md
```

実クライアントデータはGit管理しない。

---

# 6. Open Notebook

Open Notebook本体はfork・改造しない。

Dockerによる外部サービスとして扱う。

BridgeからOpen Notebook内部Pythonコードをimportしてはならない。

通信はHTTP APIのみとする。

起動後、必ず現在稼働しているバージョンの、

```text
/health
/docs
/openapi.json
```

等を確認する。

API Schemaについては、実際に起動したバージョンのOpenAPIを優先する。

---

# 7. AIモデルの責任分離

Open Notebookでは用途別に複数種類のモデルを使用する。

最低でも概念的に以下を区別する。

```text
Language Model
Embedding Model
Transformation Model
Large Context Model
```

今回の問い合わせ回答品質比較では、原則Language Modelのみを変更する。

例えば、

```text
Embedding Model = 固定

Language Model A = Groq
Language Model B = Gemini
```

として比較する。

Embedding ModelとLanguage Modelを同時変更して比較してはならない。

変更要因を一つずつ分離すること。

---

# 8. 初期モデル候補

モデルIDをコードへ固定しない。

Open Notebook上で実際に登録・Connection Testが成功したモデルだけをEvaluation対象とする。

初期候補：

```text
Candidate A
Provider: Groq
Model: openai/gpt-oss-120b

Candidate B
Provider: Groq
Model: openai/gpt-oss-20b

Candidate C
Provider: Gemini
Model: 評価実施時点で利用可能なFlash系モデル
```

モデル提供状況は変更されるため、モデルIDはConfigurationとして管理する。

例：

```yaml
models:
  - id: groq-120b
    provider: groq
    model: openai/gpt-oss-120b

  - id: groq-20b
    provider: groq
    model: openai/gpt-oss-20b

  - id: gemini-flash
    provider: gemini
    model: ${GEMINI_EVALUATION_MODEL}
```

---

# 9. Embedding Model

Language Model比較中はEmbedding Modelを固定する。

初期候補としてGemini等、Open NotebookがEmbedding用途として正式に扱えるProviderを利用する。

例：

```text
Embedding Configuration E1
Provider: Gemini
Model: Open Notebook上で利用可能なEmbedding Model
```

Groq Language Modelを使用する場合も、Embeddingは別Providerを利用する。

---

# 10. AnswerProvider

Bridge内部ではOpen Notebookへの問い合わせを抽象化する。

```ts
export interface AnswerProvider {
  answer(input: AnswerInput): Promise<AnswerResult>;
}
```

概念型：

```ts
type AnswerInput = {
  message: string;
  userId: string;
};

type AnswerResult = {
  text: string;
  sources?: SourceReference[];
  latencyMs: number;

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };

  model?: {
    provider?: string;
    model?: string;
  };
};
```

実装：

```text
MockAnswerProvider
OpenNotebookProvider
```

---

# 11. Knowledgeデータ

現在収集中の実際のQ&Aを使用する。

基本形式：

```json
{
  "id": "faq-001",
  "category": "予約",
  "question": "団体予約はできますか？",
  "answer": "正式回答",
  "conditions": "",
  "source": "過去問い合わせ",
  "updatedAt": "2026-09-11"
}
```

必須：

```text
id
question
answer
```

推奨：

```text
category
conditions
source
updatedAt
```

---

# 12. KnowledgeとEvaluationを分離する

Knowledgeに登録した質問文をそのままEvaluation Questionとして使用するだけでは不十分。

例：

Knowledge：

```text
Q:
チェックインは何時ですか？

A:
15時です。
```

Evaluation：

```text
何時から部屋に入れますか？
```

とする。

単なる完全一致ではなく意味検索・回答能力を評価する。

---

# 13. Golden Regression Dataset

モデル比較に使用する評価データを、

```text
Golden Regression Dataset
```

として管理する。

初期は30〜50問。

本番開始までに、可能であれば50〜100問へ拡張する。

カテゴリ例：

```text
通常FAQ
言い換え
曖昧表現
条件付き質問
複数条件質問
Follow-up
情報なし
誤誘導質問
数字・金額
日時
キャンセル等重要条件
```

---

# 14. Evaluation Schema

例：

```json
{
  "id": "eval-001",
  "category": "営業時間",
  "question": "今日は何時まで対応してもらえますか？",

  "expectedFacts": [
    "17:00"
  ],

  "forbiddenFacts": [
    "18:00",
    "24時間"
  ],

  "shouldAnswer": true,

  "severity": "normal"
}
```

回答してはいけない場合：

```json
{
  "id": "eval-042",
  "category": "未登録料金",
  "question": "来年度はいくらになりますか？",
  "expectedFacts": [],
  "shouldAnswer": false,
  "severity": "critical"
}
```

---

# 15. severity

Evaluation Caseには重要度を持たせる。

```text
normal
important
critical
```

Critical例：

```text
金額
予約確定条件
キャンセル
返金
営業時間
日付
安全事項
契約条件
```

Critical Caseの誤回答は通常Caseより重く扱う。

---

# 16. 回答評価スコア

人間評価：

```text
2
完全に正しい

1
軽微な不足はあるが顧客へ送信可能

0
回答不能・有用性なし

-1
明確な誤回答

-2
Knowledgeに存在しない事実を具体的に捏造
```

Critical Questionで、

```text
-1
-2
```

となった場合は重大Regressionとして扱う。

---

# 17. 自動評価

Evaluation Runnerでは最低限以下を自動判定する。

```text
expectedFacts含有確認

forbiddenFacts含有確認

shouldAnswer=false時の
具体的断定検出補助

Latency

Token Usage

Estimated Cost
```

LLM Judgeを追加してもよい。

ただしPoC段階では、人間評価を最終基準とする。

LLM Judgeの判定だけでモデルを採用しない。

---

# 18. Model Evaluation Runner

以下を実装する。

```text
evaluation/runner/
```

実行イメージ：

```bash
npm run eval -- --model groq-120b

npm run eval -- --model groq-20b

npm run eval -- --model gemini-flash
```

処理：

```text
Golden Dataset
       ↓
Selected Model Configuration
       ↓
Open Notebook
       ↓
Question
       ↓
Answer
       ↓
Metrics Collection
       ↓
JSON Result
```

---

# 19. 1回答ごとの保存項目

```json
{
  "testId": "eval-001",

  "provider": "groq",
  "model": "openai/gpt-oss-120b",

  "question": "...",
  "answer": "...",

  "expectedFacts": ["..."],

  "latencyMs": 1820,

  "inputTokens": 4200,
  "outputTokens": 230,

  "estimatedCostUsd": 0.0008,

  "automaticChecks": {
    "expectedFacts": true,
    "forbiddenFacts": true
  },

  "humanScore": 2,

  "timestamp": "..."
}
```

---

# 20. Model Summary

モデルごとに以下を集計する。

```text
Total Questions

Usable Answer Rate
Perfect Answer Rate

Hallucination Count
Hallucination Rate

Critical Failure Count

p50 Latency
p95 Latency
Maximum Latency

Average Input Tokens
Average Output Tokens

Average Cost / Question
Projected Monthly Cost / 150 Questions
```

---

# 21. 初回モデル比較

同一Knowledge、同一Embedding、同一Open Notebook Version、同一Evaluation Datasetで比較する。

```text
Groq 120B
vs
Groq 20B
vs
Gemini Flash
```

比較中は、

```text
Knowledge
Embedding Model
Open Notebook Version
Ask/Chat Mode
System Instructions
Evaluation Dataset
```

を変更しない。

---

# 22. Query Mode比較

モデル比較とは別に、

```text
ask
chat
```

等、Open Notebookで利用可能な問い合わせ経路を比較する。

Model TestとQuery Mode Testを同時に混ぜない。

例：

Phase 1：

```text
Groq 120B
Ask

vs

Gemini Flash
Ask
```

Phase 2：

採用モデルを固定して、

```text
Ask
vs
Chat
```

を比較する。

---

# 23. モデル採用基準

優先順位：

```text
1. Critical Failure
2. Hallucination
3. 正答率
4. Knowledge Grounding
5. 日本語品質
6. p95 Latency
7. Cost
```

API単価を最優先してはならない。

今回の問い合わせ量ではモデルAPIコストがインフラ固定費より小さい可能性が高いため、数百円単位の価格差より品質を優先する。

---

# 24. 初期合格基準

回答可能Question：

```text
Score >= 1
85%以上
```

情報なしQuestion：

```text
具体的な誤回答をしない
90%以上
```

Critical：

```text
重大な捏造
0件を目標
```

Latency：

```text
p95 < 30秒
```

を初期目標とする。

---

# 25. Baseline

初期採用モデルが決定したら、そのEvaluation結果をBaselineとして保存する。

例：

```text
evaluation/baselines/
└─ baseline-2026-09.json
```

Baselineには以下を保存する。

```text
Open Notebook Version

Language Provider
Language Model

Embedding Provider
Embedding Model

Query Mode

Knowledge Revision

Evaluation Dataset Revision

Prompt / Instruction Revision

Accuracy

Hallucination Rate

Critical Failure Count

p50
p95

Cost
```

---

# 26. Regression Test

以後、以下の変更時には必ずGolden Regression Datasetを再実行する。

```text
Language Model変更

Model Provider変更

Embedding Model変更

Open Notebook Version更新

Knowledge大量更新

Prompt / Instructions変更

Ask / Chat Mode変更

Search設定変更

Chunking設定変更

Retrieval設定変更
```

---

# 27. Regression判定

新しい結果をBaselineと比較する。

例：

```text
Baseline
Usable Rate: 92%
Hallucination: 2%
Critical Failure: 0
p95: 4.2 sec

Candidate
Usable Rate: 86%
Hallucination: 8%
Critical Failure: 1
p95: 2.1 sec
```

この場合、速度が改善していても不採用。

---

# 28. Regression Failure条件

以下のいずれかに該当する場合、Regression Failureとする。

```text
Critical Failureが新規発生

Hallucination Rateが大幅増加

Usable Answer RateがBaselineから5ポイント以上低下

特定重要カテゴリが10ポイント以上低下

p95 LatencyがLINE運用許容値を超過
```

Cost上昇だけでは自動Failureにしない。

ただし月間想定費用を必ず報告する。

---

# 29. Test Case追加ルール

本番運用開始後、

```text
AIが誤回答した
AIが答えられなかった
人間へエスカレーションされた
想定外の言い回しが来た
```

場合、その問い合わせを匿名化し、

```text
Golden Regression Dataset
```

へ追加する。

特に不具合修正時は、

```text
Bug
↓
Regression Test Case追加
↓
修正
↓
全テスト再実行
```

の順番とする。

「その質問だけ直して終わり」にしない。

---

# 30. Dataset Version

Regression DatasetへRevisionを付ける。

```text
regression-v001
regression-v002
regression-v003
```

変更履歴を残す。

例：

```text
v002

Added:
eval-051
実ユーザーから発生したキャンセル条件質問

Reason:
Groq Modelで誤回答が発生
```

---

# 31. Knowledge Revision

Knowledge側にもRevisionを持たせる。

例：

```text
knowledge-2026-09-11-r1
```

Evaluation結果から、

```text
どのKnowledge
どのDataset
どのModel
```

を使ったか再現できるようにする。

---

# 32. Model Registry

利用可能モデルをConfigurationで管理する。

例：

```yaml
modelProfiles:

  groq-120b:
    provider: groq
    languageModel: openai/gpt-oss-120b
    embeddingProfile: default

  groq-20b:
    provider: groq
    languageModel: openai/gpt-oss-20b
    embeddingProfile: default

  gemini-flash:
    provider: gemini
    languageModel: ${GEMINI_FLASH_MODEL}
    embeddingProfile: default
```

Model IDをBridgeのBusiness Logicへ書かない。

---

# 33. Production Model変更手順

本番モデルを変更する場合：

```text
Candidate Model登録

↓

Connection Test

↓

Golden Regression Test

↓

Baseline比較

↓

Human Review

↓

合格

↓

本番モデル変更

↓

Smoke Test

↓

Baseline更新
```

Regression Testなしでモデルを変更しない。

---

# 34. Open Notebook Version Update

Open Notebookを更新する場合も同様。

```text
Backup

↓

Staging / DevelopmentでUpdate

↓

OpenAPI差分確認

↓

Regression Test

↓

Bridge Integration Test

↓

合格

↓

Production Update
```

`latest`タグを無条件に自動更新しない。

---

# 35. Model Deprecation対応

外部Providerはモデルを廃止・変更する可能性がある。

モデル廃止時：

```text
新Candidate確認
↓
Open Notebookへ登録
↓
Golden Dataset実行
↓
Baseline比較
↓
合格モデルへ移行
```

Provider変更でもBridgeコードを書き換えずに済む設計を維持する。

---

# 36. Bridge

技術：

```text
Node.js
TypeScript
Express
LINE Messaging API SDK
SQLite
Vitest
```

Bridgeは以下を担当する。

```text
Webhook受付
Signature Verification
Duplicate Detection
Job Queue
Worker
Open Notebook API Call
Timeout
Retry
LINE Reply / Push
Logging
```

---

# 37. LINE処理

```text
POST /webhooks/line
```

受信：

```text
Raw Body
↓
Signature Verification
↓
Parse
↓
Text Event抽出
↓
webhookEventId確認
↓
SQLite Job登録
↓
HTTP 200
```

Webhook HTTP接続内でAI回答を待たない。

---

# 38. Persistent Queue

SQLiteを使用する。

最低：

```text
line_events
jobs
```

を保持する。

再起動してもPending Jobが消えないこと。

---

# 39. Concurrency

初期：

```text
WORKER_CONCURRENCY=2
```

異なるユーザーは並列実行可能。

同じユーザーは受信順を維持する。

最低以下を試験する。

```text
3ユーザー同時

10問い合わせBurst

同一ユーザー3連投
```

---

# 40. Retry

初期：

```text
MAX_RETRIES=2
```

Retry候補：

```text
Timeout
429
502
503
Network Error
```

永久Retryは禁止。

---

# 41. LINE Response

通常はReply APIを使用する。

AI処理が長引く場合は、

```text
Loading
↓
AI処理
↓
通常Reply
```

一定時間を超えた場合、

```text
中間Reply
↓
最終回答Push
```

への切替を可能にする。

---

# 42. Mock Provider

Open Notebookとは独立してBridgeを実装可能にする。

```text
ANSWER_PROVIDER=mock
```

で、

```text
Webhook
↓
Queue
↓
Mock
↓
LINE Client
```

まで試験可能とする。

---

# 43. テスト階層

テストを以下に分離する。

## Level 1

```text
Unit Test
```

Bridgeロジック。

## Level 2

```text
Bridge Mock Integration Test
```

Open Notebookなし。

## Level 3

```text
Open Notebook Model Evaluation
```

LINEなし。

## Level 4

```text
Open Notebook Regression Test
```

モデル・Knowledge等の品質確認。

## Level 5

```text
Bridge → Open Notebook Integration
```

## Level 6

```text
LINE E2E
```

## Level 7

```text
Concurrency / Failure Test
```

---

# 44. PoC実装順序

```text
Repository初期化

        ↓

┌──────────────────────┐
│ Track A              │
│                      │
│ Open Notebook        │
│ AI Provider登録      │
│ Knowledge投入        │
│ Golden Dataset作成   │
│ Model比較            │
│ Baseline作成         │
└──────────────────────┘

並行

┌──────────────────────┐
│ Track B              │
│                      │
│ Bridge               │
│ SQLite               │
│ Queue                 │
│ Mock Provider        │
│ LINE Adapter         │
└──────────────────────┘

        ↓

OpenNotebookProvider

        ↓

Integration Test

        ↓

LINE接続

        ↓

Concurrency Test

        ↓

Failure Test

        ↓

Client VPS Deployment

        ↓

Production Regression Test

        ↓

納品
```

---

# 45. Codex初回セッション

最初のセッションで以下を進める。

1. Repository初期化
2. `.gitignore`
3. `.env.example`
4. Docker Compose作成
5. Open Notebook起動
6. Health確認
7. OpenAPI保存・確認
8. Open Notebook Version記録
9. Bridge TypeScript Project作成
10. AnswerProvider Interface
11. MockProvider
12. SQLite準備
13. Health Endpoint
14. Unit Test
15. `evaluation/`構造作成
16. Regression Dataset Schema作成
17. Sample Test Dataset作成
18. Model Configuration Schema作成
19. Evaluation Runner雛形作成
20. README更新

API Key不足の場合も、Credentialが必要になる地点まで作業を進める。

---

# 46. AI接続後の実験順序

Credential取得後：

```text
Open Notebook
↓
Embedding設定
↓
Groq登録
↓
Gemini登録
↓
実Q&A投入
↓
Source処理確認
↓
Golden Dataset作成
↓
Groq 120B Test
↓
Groq 20B Test
↓
Gemini Flash Test
↓
比較Report
```

モデル候補は実施時点の利用可能モデルに応じて変更可能。

---

# 47. Model Comparison Report

以下の表を自動生成または半自動生成する。

```text
Model:
Provider:

Usable Rate:
Perfect Rate:
Hallucination Rate:
Critical Failures:

p50:
p95:

Avg Input Tokens:
Avg Output Tokens:

Cost / Query:
Projected Cost / 150 Queries:

Human Notes:
```

さらにモデル間比較表を作る。

```text
                 Groq120   Groq20   Gemini
Usable Rate
Hallucination
Critical Error
p50
p95
Cost/150
```

---

# 48. PoC完了条件

```text
[ ] Open Notebook起動
[ ] AI Provider接続
[ ] Embedding成功
[ ] 実Q&A投入
[ ] Golden Dataset作成
[ ] 30〜50問以上評価
[ ] 2モデル以上比較
[ ] Baseline作成
[ ] Regression Runner完成
[ ] Model Comparison Report作成
[ ] Bridge Mock Test成功
[ ] OpenNotebookProvider成功
[ ] LINE E2E成功
[ ] 同時3件成功
[ ] Duplicate防止成功
[ ] Timeout対応成功
[ ] Server Restart Recovery成功
```

---

# 49. 本番納品条件

```text
[ ] Client VPS上に構築
[ ] HTTPS
[ ] DB非公開
[ ] Client Credentialのみ使用
[ ] Production Model決定
[ ] Production Regression Test合格
[ ] Baseline保存
[ ] Backup
[ ] Restore手順
[ ] GitHubから再構築可能
[ ] Knowledge更新手順
[ ] Model変更手順
[ ] Regression Test実行手順
[ ] Open Notebook更新手順
```

---

# 50. 納品後の品質維持

クライアント運用後も、

```text
問題問い合わせ
↓
Dataset追加
↓
Knowledge修正
↓
Regression Test
↓
合格
↓
反映
```

を基本運用とする。

これによってGolden Datasetは実際の問い合わせとともに徐々に成長する。

本システムではEvaluation Datasetを単なるPoC用テストデータではなく、

```text
問い合わせAIの品質仕様
```

として扱う。

モデル名そのものを品質保証とはしない。

「どのモデルを使っているか」ではなく、

「固定された問い合わせ群に対して要求品質を満たしているか」

を本番採用の基準とする。