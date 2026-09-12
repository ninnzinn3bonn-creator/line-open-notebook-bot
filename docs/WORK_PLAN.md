# PoC作業計画

更新日: 2026-09-12

## 現在地

ローカルVPS相当環境、Open Notebook実API、Groq 120B、Embedding、Bridge、永続キュー、Grounding Gate、3ラリー会話、確認キュー、42問版回帰Datasetまで実装済み。40問版の回答評価は、全体実行38/40と採点定義修正後の対象再試験2/2で最終40/40を確認した。

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

## Track 3: 実店舗情報受領後

1. 承認済みFAQ、料金、営業時間、キャンセル条件、連絡先をKnowledge化
2. 合成Datasetを実店舗由来Golden Datasetへ置換
3. 人間評価、Critical判定、Source整合性を確認
4. 有人案内文、電話番号、受付時間、通知先を確定

## Track 4: ConoHa VPS準備後

1. 4GB VPS、Ubuntu、DNS、SSH鍵を準備
2. Docker、Caddy、Open Notebook、SurrealDB、Bridgeを固定版で展開
3. HTTPS、ファイアウォール、永続化、バックアップ、再起動設定
4. VPS上で42問評価、LINE E2E、同時実行、障害復旧を再実施
5. 構成、Revision、結果、費用、既知制約をPoC提出資料へ確定

## Track 4A: Oracle Always Free代替検証

OCI Ampere A1は主要コンテナのArm64 manifestを確認済み。実機を確保できた場合は、2 OCPU・8〜12GB RAMでBridgeのネイティブビルド、Compose起動、42問評価、LINE E2E、バックアップ復旧を先に実行する。全ゲート合格時だけPoC配置先をOCIへ変更し、ConoHaは容量不足・回収時の代替先として残す。詳細は`ORACLE_ALWAYS_FREE_FEASIBILITY.md`を参照する。

## 外部待ち

- LINE Channel secret、Channel access token、公開HTTPS URL
- ConoHa契約、VPS接続情報、DNS名
- 承認済み実店舗FAQと有人対応の連絡先・受付時間・通知先

秘密値、実店舗データ、生成された評価結果はGitへ追加しない。
