# PoC作業計画

更新日: 2026-09-13

## 現在地

ローカルVPS相当環境、Open Notebook実API、Groq 120B、Embedding、Bridge、永続キュー、Grounding Gate、3ラリー会話、確認キュー、42問版回帰Datasetまで実装済み。40問版の回答評価は最終40/40を確認した。LINE Webhook、実端末返信、あいさつメッセージまで接続済み。開発期間と納品後1か月の配置先はOCIとし、その後は観測結果に応じてVPSサービスへの移行を判断する。

## Track 1: 外部情報なしで進める実装

1. [完了] 有人希望と高リスク確定要求の検索前ルーティング
2. [完了] handoff recordのSQLite保存、重複防止、管理API
3. [完了] 有人案内文・電話番号・受付時間・有人チャットURLの設定化
4. [完了] 42問版Datasetへ有人希望・予約確定要求を追加
5. [完了] 同時3件、10件Burst、同一ユーザー3連投の自動試験
6. [完了] Provider Timeout、再試行、緊急回答、DB再オープン後の期限切れリース回収試験
7. [未着手] PoC提出レポートの骨組み作成

## Track 2: LINE認証後

1. `.env`へChannel secretとChannel access tokenを設定
2. `npm run line:preflight`でBot情報と登録Webhookを確認
3. 公開HTTPS URLをLINE Developersへ登録して検証を成功させる
4. 通常回答、対象外、確認待ち、有人案内、3ラリーを実端末で確認
5. Webhook受信からLINE API受付、端末表示までを分けて測定

## Track 3: 実店舗情報の受入れ

1. [準備済み] `REAL_STORE_DATA_INTAKE.md`に従い、承認者、機密区分、版、適用日を記録して受領
2. 受領原本をGit管理外の保護領域へ保存し、秘密情報・個人情報を除いた作業用コピーを作成
3. FAQ、料金、営業時間、キャンセル条件、連絡先を1FAQ単位のKnowledgeへ変換し、店舗承認を得る
4. 合成Datasetを実店舗由来Golden Datasetへ置換し、人間評価、Critical判定、Source整合性を確認
5. 有人案内文、電話番号、受付時間、通知先を確定

## Track 4: OCI暫定基盤への展開

1. OCI Ampere A1、Ubuntu Arm64、SSH鍵とCloudflare管理ドメインを準備
2. Arm64でDocker、Open Notebook、SurrealDB、Bridge、`cloudflared`を固定版で展開
3. LINE WebhookのHTTPS入口をCloudflare Tunnelへ統一し、OCI側のWebポートを直接公開しない
4. VM外バックアップ、再起動設定、復元手順、Tunnel停止時の検知を確認
5. OCI上で42問評価、LINE E2E、同時実行、障害復旧を再実施
6. 開発期間と納品後1か月、CPU・メモリ・容量・停止・回収・応答時間・復旧実績を記録
7. 1か月終了時にOCI継続、OCI有料化、またはVPSサービス移行を判定

## Track 4A: VPS移行準備

OCIから移行できるよう、Docker Compose、暗号化バックアップ、Cloudflare Tunnelの接続先切替、秘密情報の再設定、LINE Webhook URLを基盤非依存に保つ。移行判断はOCIの回収・停止、復旧時間、運用負荷、実費、応答性能を基準とし、移行先サービスの正式名称とプランは判定時に確定する。

## Track 5: PoC提出とMMP要件確定

本計画でMMPはMinimum Marketable Productと定義する。PoC提出前に、`MMP_REQUIREMENTS.md`を使い、対象業務、回答可能範囲、有人移管、運用時間、品質閾値、監視、バックアップ、個人情報、管理者作業、月額上限、障害時連絡、受入れ試験をMMP要件として固定する。PoC結果からMMPとの差分、追加開発、運用上の前提、VPS移行条件を提出資料へ明記する。

## 外部待ち

- OCIアカウント、home region、A1容量、SSH接続情報、Cloudflare管理ドメイン
- 承認済み実店舗FAQと有人対応の連絡先・受付時間・通知先
- MMPの業務責任者、受入れ担当者、月額上限、障害時連絡先

秘密値、実店舗データ、生成された評価結果はGitへ追加しない。
