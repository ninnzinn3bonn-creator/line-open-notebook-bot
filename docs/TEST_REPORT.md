# PoCテストレポート

更新日: 2026-09-11

| 項目 | 状態 | 証拠・備考 |
|---|---|---|
| Repository初期化 | PASS | Git main branchを作成 |
| 依存関係導入 | PASS | `npm install`、脆弱性0件 |
| TypeScript build | PASS | `npm run build` |
| Unit Test | PASS | Mock ProviderとSQLite重複制約 |
| LINE Webhook Integration | PASS | raw body署名検証、不正署名拒否、SQLite永続化 |
| Persistent Queue | PASS | 重複防止、同一ユーザー順序、期限切れリース回収、Push retry key維持 |
| Provider Timeout | PASS | 設定した期限超過を失敗として検出 |
| Bridge Health | PASS | `GET /health`がstatus=ok |
| Mock回答 | PASS | 日本語質問への決定的Mock応答を確認 |
| Evaluation Runner骨格 | PASS | sample v001、2件を読込 |
| Docker Compose構文 | PASS | `docker compose config --quiet` |
| ConoHa production Compose | PASS | 非秘密の検証値でproduction overrideを含めて構文確認 |
| Docker Desktop導入 | PASS | 4.90.0をインストール |
| ローカル隔離Compose定義 | PASS | 専用project/volume、loopback port、約3.3GBのサービス上限。Compose設定展開成功 |
| ローカル検証スクリプト | PASS | PowerShell構文解析成功。認証情報生成、起動、smoke、停止、専用volume初期化を実装 |
| WSL 2導入 | PASS | WSL 2.7.13、kernel 6.18.33.2、Docker Engine 29.7.2を確認 |
| ローカルOpen Notebook実起動 | PASS | Open Notebook 1.14.0とSurrealDBが専用Compose内でhealthy |
| ローカルOpen Notebook UI | PASS | `http://127.0.0.1:18502`がHTTP 200 |
| ローカルOpen Notebook API | PASS | `/health`、`/docs`、`/openapi.json`がHTTP 200。OpenAPI SHA-256 `14b99996837840df7713a4253cc8c7dfe65cfef5fa4cb2ef218fb0a750c22f39` |
| コンテナImage固定 | PASS | Open Notebook digest `sha256:e53f90d6153fcf4a64604d9a0c12cb0428a32cfb8dbcbb72e81ab12c013ee330`、SurrealDB digest `sha256:d653f6c8a89e81f865ee31cd2f587c50f50ace922175e04150b1e385d2f86011` |
| 4GB相当リソース初期確認 | PASS | 上限Open Notebook 2.5GiB、SurrealDB 768MiB。起動直後実使用約311MiB＋66MiB |
| ローカル外部AI API | PASS | Groq `openai/gpt-oss-120b`・`openai/gpt-oss-20b`、Google `gemini-3.6-flash`・`gemini-embedding-001`のModel Test成功 |
| 廃止モデル検出 | PASS | 登録時の`gemini-2.5-flash`はGoogle APIが新規利用不可を返したため不採用。再同期した`gemini-3.6-flash`へ変更 |
| 合成Knowledge投入・Embedding | PASS | ローカル専用FAQ 1件を処理し、Google Embeddingで1 chunk作成・`embedded=true`を確認 |
| Open Notebook Ask | PASS | Gemini全段、Gemini固定＋Groq 120B最終、Gemini固定＋Groq 20B最終の3構成が17:00とSource IDを回答 |
| Ask初回Latency参考値 | INFO | Gemini全段37.0秒、Groq 120B最終22.3秒、Groq 20B最終45.5秒。単発測定のためモデル採否には使わない |
| ローカル再起動永続性 | PASS | Open Notebook再起動後も2 Provider、既定モデル、埋込みSourceを保持し、Groq 120B最終で11.6秒の再回答に成功 |
| Groq無料枠連続Ask | FAIL (EXPECTED LIMIT) | Strategy・Answer・FinalをすべてGroq 120Bにした連続GUI試験で`Rate limit exceeded`を4回確認。サービスとDBはhealthyを維持 |
| 無料枠向け安定構成 | APPLIED | 既定Chatを`gemini-3.6-flash`へ戻し、Embeddingは`gemini-embedding-001`を維持。Groq 120BはFinalのみで比較する |
| Bridge緊急回答 | PASS (UNIT) | Providerの有限再試行終了後に設定文面をSQLiteへ保存し、通常のReply/Push状態で1回送信。原因を`last_error`へ保持 |
| ConoHa VPS作成 | NOT RUN | 4GBプラン採用決定。契約・接続情報が必要 |
| Open Notebook image取得 | NOT RUN | ConoHa VPS作成後に実施 |
| Open Notebook Health/OpenAPI | NOT RUN | ConoHa VPS上で固定版を起動後に実施 |
| AI Provider/Embedding | NOT RUN | Open Notebook起動とCredentialが必要 |
| 実Knowledge/品質評価 | NOT RUN | 承認済み実Q&AとGolden Datasetが必要 |
| LINE E2E | NOT RUN | 後続Track |

PASSはここに記載した範囲だけを表す。PoC完了条件の合格を意味しない。
