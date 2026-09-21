# 実店舗情報 受入れ手順

実店舗情報は、受領原本をGit管理外の保護領域へ保存し、承認済みの回答情報だけをOpen Notebookへ登録する。メール、チャット、表計算、文書のどの形式で届いても、以下の項目へ正規化する。

## 受領時に記録する項目

- 店舗名、提供者、業務承認者
- 受領日、適用開始日、改訂番号
- 公開可能情報、社内限定情報、秘密情報、個人情報の区分
- 電話番号、メール、有人チャットURLをBot回答に表示してよいか
- 旧資料の有無と失効日

## 店舗へ確認する情報

- 営業時間、定休日、臨時休業、祝日・年末年始
- 所在地、アクセス、駐車場、バリアフリー設備
- 商品・サービス、料金、税込・税別、追加費用
- 支払方法、予約方法、予約確定条件
- 変更・キャンセル・返品・返金条件
- 配送、受取、在庫回答の可否
- 電話番号、受付時間、有人対応先
- Botが回答してはいけない事項と例外判断の担当者

## 1FAQ単位の変換項目

| 項目 | 内容 |
|---|---|
| `faq_id` | 改訂後も追跡できる一意ID |
| `category` | 営業時間、料金、予約等 |
| `question_variants` | 実際に想定する質問表現 |
| `approved_answer` | 店舗が承認した回答原文 |
| `conditions` | 適用条件 |
| `exceptions` | 例外と有人確認条件 |
| `effective_from` | 適用開始日 |
| `revision` | Knowledge改訂番号 |
| `approved_by` | 業務承認者 |
| `approved_at` | 承認日時 |

## 受入れゲート

1. 秘密情報と不要な個人情報を除く。
2. 料金、予約確定、キャンセル、返金、連絡先を店舗担当者が確認する。
3. 内容が矛盾する旧資料を特定し、検索対象から外す。
4. 承認済みFAQを1FAQ単位でSource化する。
5. Source処理とEmbedding完了を確認する。
6. 実店舗由来Golden Datasetを作り、人間採点を含む回帰テストを実行する。
7. Knowledge revision、Source ID、投入内容のハッシュ、モデル、Embedding、Query mode、Prompt revisionを評価記録へ残す。

受領原本はリポジトリへ置かない。作業用データをリポジトリ内で扱う必要がある場合は`evaluation/datasets/private/`を使用し、Gitの追跡対象になっていないことを投入前後に確認する。

JSONへ正規化した後は、次のコマンドで必須項目、FAQ ID重複、配列型、公開可否を検査する。

```powershell
npm run store-data:validate -- evaluation/datasets/private/store-v001.json
npm run store-data:prepare -- evaluation/datasets/private/store-v001.json evaluation/datasets/private/prepared/store-v001
```

`store-data:prepare`は公開可のFAQだけから`knowledge.md`、質問表現ごとの`golden-dataset.json`、入力SHA-256と件数を持つ`manifest.json`を生成する。生成先もGit管理外に置く。Golden Datasetの`expectedFacts`は承認回答原文を初期値にするため、回帰実行前に店舗担当者が事実単位へ分割し、禁止事実とseverityを確認する。

入力形式は`evaluation/datasets/store-data.template.json`をコピーして使用する。テンプレートのダミー値を実データとして投入しない。
