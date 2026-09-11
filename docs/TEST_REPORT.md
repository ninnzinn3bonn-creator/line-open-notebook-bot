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
| WSL 2導入 | BLOCKED | 管理者確認がキャンセルされ、Windows機能を有効化できていない |
| ConoHa VPS作成 | NOT RUN | 4GBプラン採用決定。契約・接続情報が必要 |
| Open Notebook image取得 | NOT RUN | ConoHa VPS作成後に実施 |
| Open Notebook Health/OpenAPI | NOT RUN | ConoHa VPS上で固定版を起動後に実施 |
| AI Provider/Embedding | NOT RUN | Open Notebook起動とCredentialが必要 |
| 実Knowledge/品質評価 | NOT RUN | 承認済み実Q&AとGolden Datasetが必要 |
| LINE E2E | NOT RUN | 後続Track |

PASSはここに記載した範囲だけを表す。PoC完了条件の合格を意味しない。
