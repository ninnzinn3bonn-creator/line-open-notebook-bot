# PoCテストレポート

更新日: 2026-09-16

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
| Evaluation Runner | PASS | Bridge内部APIへ逐次質問し、必須事実、禁止事実、Source IDを自動判定。生成結果はGit対象外へ保存 |
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
| 店舗口調の単純連結 | FAIL | 挨拶の後ろに業務語を含む口調指示を貼ると、その業務語を質問と誤認し、唯一の営業時間Sourceから「平日」等を捏造した |
| Bridge回答方針分離 | PASS (UNIT) | `storefront-ja-v001`。挨拶はRAGを迂回し、顧客発話をタグで分離、業務例を除外、Source IDを本文からmetadataへ移動 |
| OpenNotebookProvider | PASS | 稼働版OpenAPIの`POST /api/search/ask/simple`に準拠。Strategy・Answer・FinalのModel record IDを明示してBridge内部APIから実回答 |
| 合成FAQ回帰Source | PASS | 架空店舗FAQ 20件を1 Sourceとして登録。`source:k3knm5n86jgduhp4b9d9`、処理status=`completed`、`embedded=true` |
| Groq 120B全段・20問回帰 | 19/20 | 有料枠でStrategy・Answer・FinalをGroq `openai/gpt-oss-120b`に固定。平均7.44秒、p95 11.42秒、最大14.87秒、429なし。Wi-Fi回答は事実一致したがSource IDが返らずFAIL |
| Source citation安定性 | FAIL | 同じSourceに基づく正答でもOpen Notebook最終回答がSource IDを省く場合がある。本文内citationだけを根拠判定に使う構造では不十分 |
| Bridge Grounding Gate | PASS | `vector-gate-v001`。検索APIの生質問scoreで0.70以上を回答、0.60以下を対象外、その間を確認待ちへ分類。検索結果のSourceを回答metadataへ保持 |
| 三段階判定・実API | PASS | 営業時間0.804=`in_scope`、Pythonコード要求0.561=`out_of_scope`、未登録おすすめ商品0.644=`needs_review`を確認 |
| 人手確認キュー | PASS (UNIT) | 境界質問をSQLiteへ保存し、同一user ID・同一質問の再試行では重複登録しない |
| 全体検索Source衛生 | FAIL→RESOLVED | 旧営業時間Sourceの年末年始表現が20件版回答へ混入。旧合成Sourceを削除後、20件版Sourceだけを根拠に9:00〜17:00を回答 |
| Grounding込み20問回帰 | PASS (FACTS) | 20問すべて`in_scope`で事実上正答し検索Sourceを保持。初回自動判定18/20は「17時/17:00」「国外/海外」の表記差で、選択肢グループ対応後の該当2問再試験は2/2成功 |
| 店舗関連・低score保護 | PASS | 「店員の対応について相談したい」は0.669で`needs_review`。店舗関連語がある低score質問も対象外へ即時拒否せず確認キューへ送る実装と単体試験を追加 |
| 確認キュー管理API | PASS | Bearer認証付き一覧・確定APIを実装。`in_scope`、`out_of_scope`、`knowledge_missing`と担当者メモを保存し、decision historyへ監査記録を追加 |
| 3ラリー会話保持 | PASS | `three-rallies-v001`。user IDごとに会話を分離し、顧客・Bot turnと回答metadataをSQLiteへ保存。3ラリー到達と明示リセットで新conversationへ切替 |
| 文脈依存質問・実API | PASS | 「営業時間は何時まで？」に続く「土曜日も同じ？」を直前話題付き検索へ変換。score 0.795、土曜日も9:00〜17:00と回答し、同一conversationへ2ラリー保存 |
| ConoHa VPS作成 | NOT RUN | 4GBプラン採用決定。契約・接続情報が必要 |
| Open Notebook image取得 | NOT RUN | ConoHa VPS作成後に実施 |
| Open Notebook Health/OpenAPI | NOT RUN | ConoHa VPS上で固定版を起動後に実施 |
| AI Provider/Embedding | NOT RUN | Open Notebook起動とCredentialが必要 |
| 実Knowledge/品質評価 | NOT RUN | 承認済み実Q&AとGolden Datasetが必要 |
| LINE E2E | NOT RUN | 後続Track |

PASSはここに記載した範囲だけを表す。PoC完了条件の合格を意味しない。

| 合成FAQ 40問回帰 v002 | PASS (COMBINED) | 全体実行38/40。2件は同義表現の採点False Negativeで、定義修正後の対象再試験2/2。最終確認40/40。平均5.42秒、p95 10.38秒、429なし。詳細はREGRESSION_REPORT_v002.md |
| LINE E2E事前診断 | READY / CREDENTIALS PENDING | Token、登録Webhook、有効状態、署名付き空Webhookを確認する npm run line:preflight を追加。現時点ではChannel secret、access token、公開HTTPS URLが未設定 |
| 有人移管ルーティング | PASS | `human-handoff-v001`。明示的な有人希望と予約・注文・取り置き・返金等の高リスク確定要求を検索前に`needs_review`へ送り、理由付きhandoff recordをSQLiteへ保存 |
| 有人移管管理API | PASS | Bearer認証付き一覧・解決API、重複防止、会話の`human_handoff`終了、設定可能な案内文・電話・受付時間・チャットURLを実装 |
| 有人移管決定経路 | PASS | 42問版へ有人希望と予約確定要求を追加。Mock Bridge実経路で2/2、Latency最大1ms |
| 有人移管稼働Bridge確認 | PASS | 稼働中Bridgeで「担当者に相談したいです」がAIを呼ばず`needs_review`となり、pending登録、認証済み管理APIでの一覧取得・対応完了まで確認 |
| 有人対応中のBot停止・復帰 | PASS (UNIT) / LINE CHAT PENDING | pendingのLINE user IDだけ返信を抑止し、他ユーザーは継続。resolve後に対象ユーザーのBot回答が復帰し、抑止中はLINE送信APIを呼ばないことを確認 |
| LINE実端末3台同時質問 | PASS (MANUAL) | 2026-09-16、異なる3台から同時にAI回答を要求し、全端末へ通常返信。最も遅い端末は約10秒。質問別の厳密なLatency計測は未実施 |
| 3ユーザー同時・10件Burst | PASS (AUTOMATED) | 3ワーカー相当を並行実行し最大同時数3、10件すべて1回ずつ送信成功 |
| 同一ユーザー3連投 | PASS (AUTOMATED) | 3ワーカー相当でも後続が先行処理を追い越さず、message-1、2、3の順で送信 |
| Provider Timeout・緊急回答 | PASS (AUTOMATED) | 5ms Timeout、有限再試行1回、2回目失敗後に緊急回答を1回だけ送信し、原因を保存 |
| Bridge再起動復旧 | PASS (AUTOMATED) | processing中にSQLiteを閉じて再オープンし、期限切れleaseをpendingへ回収後、回答生成・送信完了 |
| OCI Compose構文 | PASS (LOCAL CONFIG) | `docker-compose.oci.yml`を非秘密の検証値で展開し、Open Notebook、SurrealDB、Bridge、edge-router、cloudflaredの5サービスを確認 |
| OCI image固定 | PASS (CONFIG) | Open Notebook、SurrealDB、Cloudflared、Caddyを2026-09-13確認のmulti-arch index digestへ固定。OCI Arm64実起動は未実施 |
| OCI初期化・展開スクリプト | PASS (SYNTAX) | Git Bashで`bootstrap-oci.sh`と`deploy-oci.sh`の構文確認に成功。Arm64実機実行は未実施 |
| Cloudflare公開経路制限 | PASS (CONFIG) | `Caddyfile.oci-tunnel`で`/webhooks/line`と`/health`のみBridgeへ転送し、その他を404にする構成を追加。固定Tunnel実接続は未実施 |
| OCIバックアップ／復元 | READY / REAL HOST PENDING | 停止整合性、AES-256暗号化、SHA-256検査、復元先検査を実装し、Bash構文検査に成功。OCI実機でのデータ復元確認は未実施 |
| OCI内部監視 | READY / REAL HOST PENDING | 5サービスのrunning状態、Bridge・Open Notebook内部Health、任意のTunnel外形URLを検査するコマンドを実装。通知先はMMP承認待ち |
| 納品運用パッケージ | READY / CLEAN VM PENDING | Ubuntu共通bootstrap、doctor、deploy、diagnose、systemd、acceptance、release ZIP生成と移管ランブックを実装。空VM復元試験は未実施 |
| 納品運用パッケージ静的検証 | PASS | ShellCheck全スクリプト、TypeScript build、39 unit tests、tunnel/direct Compose解決、両Caddyfile検証に成功 |
| LINEクイックリプライ | PASS (UNIT) / DEVICE PENDING | 回答末尾へ営業時間、アクセス、予約、担当者相談の4項目を付与。文字数制限と不正設定除外を自動試験済み |
| Webhook再送重複排除 | PASS (INTEGRATION) | 同じ署名済みWebhook event IDを2回送信し、HTTP 200を返しつつjobが1件だけ保存されることを確認 |
| 実店舗データ受入れ検査 | PASS (TEMPLATE) | `npm run store-data:validate`で必須項目、FAQ ID重複、配列型、公開可否を検査。テンプレート1件でPASS |
| PoC提出レポート骨組み | READY | 固定Revision、受入れ結果、品質・費用、MMP差分、初月観測、既知制約の章を作成 |
