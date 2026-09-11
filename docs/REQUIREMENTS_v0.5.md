# LINE × Open Notebook 問い合わせBot
## PoC・モデル回帰テスト実装要件定義 v0.5

更新日: 2026-09-11

v0.4の本文を継承し、合意された構造レビューと全体検索の運用前提を第51〜58章へ追加した。今後の実装のSource of Truthは本書とする。第0〜50章と追加章の記述が衝突する場合は第51〜58章を優先する。v0.4は受領原文として保存する。

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

PoCの実行・提出基盤はConoHa VPSの4GBプラン（4 vCPU、100GB SSD、GPUなし）を採用する。Ubuntu LTSとDocker Composeを使用し、Open Notebook、SurrealDB、LINE Bridge、SQLite、Reverse Proxyを同一VPS上で稼働させる。LLMとEmbeddingは外部APIを利用し、ローカル推論環境は搭載しない。

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

---

# 51. 今回の提出範囲

今回のミッションは第48章のPoC提出とする。PoC自体はConoHa VPS 4GB上で実行する。クライアント固有アカウントへの最終移管および第49章の本番納品条件は次段階とする。

実Q&A、30〜50問以上のGolden Dataset評価、2モデル以上の比較、人間評価、Baseline、Regression Runner、比較レポート、LINE E2Eと障害・復旧試験をPoCに含める。Mock成功を実AI評価やLINE E2Eの代替にしない。

単一BridgeインスタンスとSQLiteで実装する。独自管理UI・分散キュー・マルチテナント基盤はPoCの必須対象に追加しない。サブエージェントは使用しない。

# 52. LINEの応答期限・送信状態・復旧

## 52.1 期限

- PoCの初期対象はLINEの1対1テキスト問い合わせとする。
- Webhook受信時刻を永続化し、キュー待ち・AI処理・再試行・送信を含めた総時間で期限を管理する。
- 中間Replyを必要とする場合、その期限処理はAIワーカーの空きを待たずに実行できる構成にする。LoadingをReply期限の延長として扱わない。
- 中間Replyと通常Replyが競合しないよう、Reply使用権を原子的に確保する。
- 返信切替時刻、AI試行Timeout、総処理期限、送信TimeoutをConfigurationに定義する。具体値は実LINE仕様と少数の実測で決め、E2E開始前に確定する。
- 総期限を超える無条件の再試行は禁止。最終回答Pushの条件、Push不可時、送信結果不明時の終了方針を実装時に明記する。
- LINE公式仕様上、Reply tokenは1回限り・受信後1分以内の使用が必要であり、この時間を保証された待機猶予として使わない。

## 52.2 永続化と重複防止

- webhookEventIdにUNIQUE制約を設定する。イベント記録とJob登録を同一トランザクションで確定した後にHTTP 200を返す。
- Jobを原子的に取得し、処理リース・期限切れ回収・有限再試行を実装する。
- 同一ユーザーは先行Jobの再試行中も追い越さない。先行Jobが成功または終端失敗してから後続へ進む。
- 生成した回答を保存し、回答生成とLINE送信の状態・再試行回数を分離する。送信再試行だけのために回答を再生成しない。
- Pushの再試行キーは初回送信前に保存し、同じ送信の再試行では同じキーと同じ内容を使う。
- Replyの通信結果不明を送信失敗と同一視しない。結果不明時の無条件Push切替は禁止し、二重回答を避ける終了・確認方針を記録する。
- 再起動時にはPendingだけでなく処理中・送信中の状態を確認する。外部APIをまたぐ厳密なexactly-onceは保証しない。

## 52.3 試験と時間測定

同時3ユーザー、10件Burst、同一ユーザー3連投、Webhook再配信、429、Timeout、生成中停止、送信後DB更新前停止を試験する。

EvaluationではProvider呼出し開始から回答完了までを測定する。LINE E2EではWebhook受信から最終送信APIの受付までを別途測定し、キュー待ち・再試行を含める。API受付を端末への到達確認と呼ばない。失敗・Timeout件数はLatencyと併記する。第24章のp95 < 30秒は初期評価目標とし、E2Eの許容値は別設定で確定する。

# 53. Open Notebook APIとモデル比較の補足

公開mainの調査結果は参考とし、固定した稼働版のOpenAPIと実応答を最終根拠にする。少数の実Q&Aで以下を先に確認する。

- Ask/Chatの入力、完了判定、エラー、出典の取得方法、指示文の適用方法。
- Providerのモデル名称とOpen Notebook登録レコードIDの対応。
- 問い合わせ経路が使用する全モデルの役割と実ID。
- Usage・費用の取得可能範囲。

Askがstrategy_model、answer_model、final_answer_modelを要求する場合、PoCの初回比較はstrategyとanswerを固定し、final_answerだけを候補間で変更する。この実験は最終回答モデルの比較であり、全段階を候補モデルで処理した比較ではないことをレポートに明記する。3役全体を変更する場合は別のパイプライン比較として実施する。EmbeddingとKnowledge等の固定条件は引き続き守る。

Baseline・個別結果には全役の実モデル、指示・検索設定のRevision、比較で変更した役割を記録する。BridgeとRunnerは同じ回答経路・設定を使用する。

取得不能のToken Usage/Costはnullと理由を保存する。推定を行う場合は測定値と区別し、価格の出典・取得日・計算対象を記録する。最終生成だけの費用をAsk全体の費用と扱わない。根拠追跡は引用ID・引用箇所など実APIで確認できる情報で行い、sourcesが返らない場合に推測で作らない。

# 54. Knowledge全体検索の運用前提

今回のOpen Notebookには、このBotが回答に使用する承認済みのFAQ・業務資料だけを登録する。この前提でOpen Notebook全体を検索する。Notebook IDによる検索対象の限定をPoCの必須条件にはしない。

Notebookは主に担当者が資料を整理・更新するための単位とする。初期は1つの回答用Notebookで開始する。カテゴリ別に整理する場合も、全体検索を維持する。

この前提はSourcesだけでなく検索対象となるNotes/Insights等にも適用する。評価専用の質問セット・期待回答・採点結果、未承認のAI生成要約・回答を検索用Knowledgeとして保存しない。業務FAQの正式回答は登録対象であり、評価データをそのまま登録することとは区別する。

全体検索では別Notebookへ移動するだけで旧資料を検索対象外にできると仮定しない。旧版や下書きの保管方法・検索対象からの除外方法は実稼働版で検証する。将来ほかの用途の資料を同じインスタンスに追加するときに検索範囲を再検討する。

# 55. Knowledge構成・投入・更新

構成の初期案と調査根拠をKNOWLEDGE_DESIGN.mdに記録する。初期案は以下とする。

- JSONのid/question/answerを原データの基本とし、Sourceには質問・正式回答・適用条件・例外・対象サービス・有効期間等が一緒に読めるテキストを登録する。
- 初期は1FAQを1Sourceとして検証する。条件と例外は分離しない。複数FAQが不可分の規程を共有する場合は小さな業務単位でまとめる案も比較する。
- カテゴリと安定IDをタイトルに含め、対象・質問・条件等の意味情報は本文にも含める。表示順やタイトルだけに検索品質を依存させない。
- Sourceの処理・Embedding完了を確認してから評価する。チャンクに質問・回答・条件が保たれるか実データで確認する。
- 初期は自動TransformationやBot回答のKnowledgeへの自動還流を使わない。
- Knowledge Revisionに投入内容のスナップショット/ハッシュ、Source ID対応表、処理状態、Embedding設定を結び付ける。実データとその派生物はGit管理しない。
- 同じFAQ IDの再投入を制御し、再実行で重複Sourceを増やさない。
- 更新時に旧版と新版を現役の根拠として混在させない。PoCでは応答処理を一時停止した上で、バックアップ、置換、索引処理完了、検索確認、回帰テスト、再開の順で更新できる手順を用意する。
- クライアントがUIから更新した場合も、評価前に内容とSource対応表を取得してRevisionを更新する。import元JSONでUI変更を黙って上書きしない。
- Embedding変更時は対応する索引を再生成する。

資料構成の比較ではモデル・Embedding・Dataset・問い合わせ経路を固定する。少数の代表質問で構成を確認し、決定した構成で全Golden Datasetを評価する。構成比較とモデル比較を同時に行わない。

# 56. 会話と日時のPoC仕様

初期PoCは単発QAとし、履歴がないと解釈できないFollow-upには確認質問を返すことを正解とする。同一ユーザーの順序制御を、会話記憶の実装と同一視しない。

文脈を引き継ぐ会話を追加する場合は、conversationId、複数turn、保持範囲、有効期限、リセット、ユーザー間の分離を仕様とDatasetへ追加する。モデル間で会話セッションを使い回さない。

「今日」「来年度」等の質問では基準日時とAsia/Tokyoを評価入力・結果へ保存し、実際の回答経路にも同じ基準を渡す。日時を指定できない経路では日付を明記した入力を使い、その変換を記録する。更新日と業務ルールの適用期間を区別し、将来の未登録条件を断定しない。

# 57. 評価・回帰判定の明確化

- 回答可能ケースの有用回答率はshouldAnswer=trueの全対象件数を分母とし、Score >= 1を成功とする。Timeout/エラーを分母から消さない。
- shouldAnswer=falseでの適切な拒否・確認は正しい回答として採点し、安全回答率を別集計する。無応答・通信失敗は安全回答の成功として数えない。
- 人間未採点はhumanScore=null。最終判定はpendingとし、未採点を0や合格に置き換えない。
- CriticalのScore -1/-2は初回採用・更新とも不合格とする。件数増加だけでなくケース単位の新規失敗も報告する。
- 有用回答率85%以上、情報なしケースの安全回答率90%以上を初期合格基準とする。人間評価を最終基準とする。
- 捏造率の「大幅増加」の閾値、重要カテゴリ一覧、E2EのLatency許容値は設定へ明示し、正式評価前に固定する。未確定の項目がある場合は最終判定をpendingとする。
- 第28章の有用回答率5ポイント以上低下、重要カテゴリ10ポイント以上低下はパーセントポイント差で判定する。
- 比率には件数・分母を併記し、小数点丸め前の値で判定する。対象0件はN/Aとし、合格率100%にしない。
- expectedFacts/forbiddenFactsの文字列検査は補助とし、否定・表記ゆれ・根拠の正しさは人間が確認する。
- Dataset変更時は同じ版でBaselineモデルも再実行する。Knowledge更新で正解が変わる場合は期待値も改訂し、旧期待値との単純比較をしない。旧結果は履歴として保存する。
- 実資料内の命令やユーザーの誤誘導に従わず、正式な資料に基づく回答を維持できるかを評価ケースに含める。

# 58. 調査・受入れの残作業

この更新は実装要件の補足であり、実動作・品質の合格を示さない。実装開始後に以下を確定し、TEST_REPORTへ残す。

1. 固定版Open Notebookの起動とOpenAPI保存、モデル役割・出典・指示・Usageの実API適合性。
2. 実Q&Aの登録粒度、抽出本文、チャンク境界、検索結果、Notes/Insightsの扱い、旧版除去の検証。
3. 返信切替・Timeout・リトライ・送信結果不明時の扱いとLINE実試験。
4. 評価設定の未確定閾値、人間採点、2モデル以上の比較とBaseline。

参照一次情報（2026-09-11確認。公開mainと採用する稼働版は区別する）:

- [LINE Reply仕様](https://developers.line.biz/en/reference/messaging-api/#send-reply-message)
- [LINE API再試行](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [Open Notebook APIモデル](https://github.com/lfnovo/open-notebook/blob/main/api/models.py)
- [Open Notebook Ask実装](https://github.com/lfnovo/open-notebook/blob/main/open_notebook/graphs/ask.py)
- [Open Notebook検索ガイド](https://github.com/lfnovo/open-notebook/blob/main/docs/3-USER-GUIDE/search.md)

# 59. VPS契約前のローカル隔離検証ゲート

ConoHa VPSへ展開する前に、開発PC上でVPS相当の隔離Docker Compose環境を構築する。Composeプロジェクト、network、volume、認証情報を通常開発環境から分離し、公開ポートは`127.0.0.1`だけにbindする。Open NotebookとSurrealDBには4GB VPSを意識したメモリ上限を設定する。

この検証はVPS上のUbuntuそのものを完全再現するものではない。Linux container、サービス間通信、永続volume、HTTP API、外部Provider接続という移植上重要な境界を先に検証する。

VPS構築へ進む条件は以下とする。

1. 固定版Open NotebookとSurrealDBが起動し、UI、`/health`、`/docs`、`/openapi.json`へ到達できる。
2. 実OpenAPIを保存し、SHA-256とコンテナイメージDigestを記録する。
3. 外部Language ModelとEmbedding ModelのConnection Testが成功する。
4. 承認済み少数FAQのSource処理とEmbeddingが完了する。
5. UIから代表質問への回答が成功し、根拠、モデル、応答時間を確認できる。
6. 実OpenAPIに基づくOpenNotebookProviderを実装し、Bridgeから同じ回答経路を呼び出せる。
7. コンテナ再起動後も設定とKnowledgeが保持され、再回答できる。

このゲート合格後にConoHa VPS 4GBへ同じ固定版と設定を展開する。30〜50問の正式モデル比較、LINE E2E、障害・復旧試験、PoC最終判定は引き続きVPSを含む後続工程で実施する。

# 60. 緊急回答と情報不足回答

Open Notebookまたは外部AI ProviderがTimeout、429、5xx、ネットワーク障害等で回答を生成できず、有限再試行を使い切った場合、BridgeはConfigurationで定義した緊急回答をLINEへ1回送る。緊急回答は生成済み回答としてSQLiteへ保存してから通常のReply/Push送信状態へ進め、送信再試行のためにAI回答を再生成しない。切替原因は内部エラーとして保存する。

初期文面は以下とする。

```text
申し訳ございません。ただいま回答を取得できませんでした。お急ぎの場合は店舗へ直接お問い合わせいただくか、時間をおいてもう一度お試しください。
```

存在しない電話番号、営業時間、連絡手段は緊急回答へ補完しない。店舗固有の連絡先を文面へ含める場合は、承認済み情報としてConfigurationへ設定する。

Knowledgeに回答根拠がない場合はProvider障害と区別する。情報不足用の案内または確認質問を返し、技術障害を示す緊急回答へ一律に置き換えない。実OpenAPIの応答だけでは根拠不足を決定できない場合、Bridge側の判定方法を評価ケースで検証してから採用する。

# 61. 店舗口調と質問分離

店舗口調の指示を顧客メッセージの後ろへ単純連結してはならない。口調指示に含まれる業務語が検索質問として解釈され、無関係なSourceを検索することを実機で確認したためである。

Bridgeは以下を行う。

- 挨拶等の決定的に処理できる発話はRAGへ送らず、承認済み定型文を返す。
- 顧客発話を明示的なタグで囲み、固定した回答方針と検索上の制約から分離する。
- 回答方針には料金・予約・キャンセル等の具体的な業務例を列挙せず、検索語の汚染を避ける。
- 顧客発話内の命令をBridgeの回答方針を変更する指示として扱わない。
- Open Notebookが返すSource IDは回答本文から分離し、LINEには内部IDを表示せず、評価・監査用metadataとして保持する。
- 回答方針にRevisionを付け、変更時にGolden Datasetを再実行する。

初期Revisionは`storefront-ja-v001`とする。ただし、この指示だけで根拠不足時の誤回答防止を保証しない。生の顧客質問による検索結果、類似度または確認可能な根拠情報を用いたGrounding Gateを別途実装・評価する。

# 62. PoC回答経路の確定計画

PoCの生成モデルはGroq `openai/gpt-oss-120b`に固定する。Embeddingは生成モデルとは分離し、動作確認済みの`gemini-embedding-001`を使用する。評価結果にはGroq側のモデルIDだけでなく、Open Notebookへ登録したModel record ID、Embedding record ID、Knowledge revision、Query mode、Prompt revisionを記録する。

Open NotebookのStrategy・Answer・FinalをすべてGroq 120Bに設定した無料枠での連続試験では、TPM制限による失敗を確認済みである。その後、有料枠を採用したため、PoCでは120Bを全生成段の候補として実測する。各段のToken usage、429発生率、応答時間を記録し、有料枠でも契約上のRate limitを超える場合は呼出し回数、投入コンテキスト、並行数を調整する。モデルを無断で別モデルへ切り替えて回答内容を変えない。

Bridgeの回答経路は次の順序で実装する。

1. 正規化した顧客発話に対して、挨拶、感謝、終了意思など安全に確定できる発話を定型応答する。
2. 営業・店舗問い合わせの対象範囲を、Knowledgeに登録するカテゴリ一覧と評価データで明示する。単語の有無だけで対象内外を決めず、短い曖昧発話は確認質問へ送る。
3. 明確に営業と関係がない質問には、生成モデルとRAGを呼ばず、対象外用の承認済み定型文を返す。
4. 対象内の質問だけを、生の顧客発話のままOpen Notebook検索APIへ送り、Grounding Gateで回答根拠の有無を判定する。
5. 根拠がある場合だけOpen Notebook Ask APIを呼び、店舗口調の回答方針と顧客発話を分離してGroq 120Bで回答する。
6. 根拠不足の場合は推測させず、情報不足用の定型文、確認質問、有人対応のいずれかへ振り分ける。
7. Timeout、429、5xx等の技術障害では、既存の緊急回答へ切り替える。

初期の対象外定型文は次とする。店舗名、電話番号、受付時間等は承認済みConfigurationがない限り補完しない。

```text
恐れ入りますが、こちらでは店舗に関するお問い合わせを承っています。店舗について確認したいことがございましたら、内容をお聞かせください。
```

有人対応への振り分け理由は少なくとも`customer_requested_human`、`insufficient_knowledge`、`high_risk_or_commitment`、`repeated_failure`、`technical_failure`に分類する。PoCでは以下を実装範囲とする。

- 「担当者に代わって」「電話したい」等の明示要求には、有人案内を即時返す。
- 予約確定、個別見積り、返金、例外的なキャンセル判断等、AIが確定してはならない処理は有人案内へ送る。
- 同一会話で情報不足または回答失敗が規定回数続いた場合は有人案内へ送る。
- 営業時間内は有人チャットまたは電話への案内、営業時間外は受付済み案内または次回営業時間の案内を返せる構造にする。
- 実際の有人チャット基盤が未接続の段階では、handoff recordをSQLiteへ保存し、承認済み連絡先への案内を返す。存在しない転送成功を通知しない。

有人案内の文面、電話番号、受付時間、有人チャットURLはConfigurationとして管理する。応答本文へ直接埋め込まず、未設定時は「店舗へ直接お問い合わせください」までに留める。LINE上でBotから有人へ切り替える具体方式は、店舗側の運用担当、対応時間、通知先、引継ぎ画面が確定した後に接続する。

PoC実装と合格判定は次の4段階とする。

1. `OpenNotebookProvider`を実OpenAPIに合わせて実装し、Groq 120Bのrecord IDを明示してBridge内部APIから回答できる。
2. 対象内、対象外、曖昧、挨拶、有人希望、根拠不足、Provider障害の各経路を決定的に試験できる。
3. 30〜50問のGolden Datasetで正答性、非捏造、口調、対象外判定、有人誘導、Source整合、Latency、Token usage、429率を記録する。
4. LINE E2Eで通常回答、定型回答、有人案内、Timeout、再送、重複Webhookを確認し、PoC提出用の再現手順と制約をまとめる。

Grounding Gateと対象内外判定の閾値は実測前に固定しない。営業時間等の明確な対象内質問、一般知識等の明確な対象外質問、短文や言い換えを含む境界質問を検索APIへ通し、誤回答を抑えつつ回答可能な質問を過度に有人へ流さない値を評価結果から決定する。
