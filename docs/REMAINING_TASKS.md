# 残タスク棚卸し

更新日: 2026-09-13

## 認証なしで実施済み

- OCI Arm64用Docker Compose、初期化・展開スクリプト
- Cloudflare Tunnel用`cloudflared`サービス
- 公開経路を`/webhooks/line`と`/health`へ限定する内部ルーター
- Open Notebook管理ホストをCloudflare Access用に分離する設定
- 実店舗データの入力テンプレートと構造検証コマンド
- PoC提出レポートの骨組み
- OCI／VPS共通の再構築可能な構成
- Tunnel tokenのsecret化、用途別Dockerネットワーク分離、内部回答APIのBearer認証
- OCI・Cloudflare・LINE・管理者経路のセキュリティ設計レビュー
- Open Notebook、SurrealDB、Cloudflared、Caddyのmulti-arch image digest固定
- 停止整合性、暗号化、SHA-256検査を備えたOCIバックアップ／復元スクリプト
- OCI内部サービスと任意の公開URLを検査するヘルスチェックコマンド

## 引き続き認証なしで進められる

- 実店舗データ受領後の変換ツール（実データをGitへ保存せず実行）
- 実店舗由来Golden Datasetの生成補助と機械検査
- MMP要件の初期値、合否表、PoCとの差分表の整備
- OCI実機でのバックアップ・新規データ領域への復元試験
- Tunnel停止、Provider障害、重複Webhookの追加自動試験
- OCI Arm64で固定image digestの起動照合
- TEST_REPORTとPoC提出レポートへの検証結果反映

## 外部認証・利用者操作が必要

- OCI A1インスタンス作成、SSH鍵登録、実機接続
- Cloudflare固定Tunnel、DNS、Access policy、Tunnel tokenの発行
- Access未認証・許可外アカウントの拒否試験とOCI受信ポート検査
- LINE Webhook URLの固定ホスト名への切替と実端末E2E
- Groq／Geminiの本番用認証情報設定

## 店舗側の情報・承認が必要

- 営業時間、料金、予約、キャンセル、連絡先等の承認済み情報
- 公開可否、個人情報、旧版失効日の確認
- 有人対応先、受付時間、通知先
- MMPの品質、性能、可用性、月額上限、障害時連絡先
- PoC結果とMMP提供可否の最終承認
