# クライアント向けKnowledge登録・変更・削除手順

## 1. この手順の原則

問い合わせBotの正式回答は、クライアントが入力し、クライアントの業務承認者が承認した内容だけを使用する。AIは文章の採用、事実確認、公開可否、例外判断、承認を行わない。AIによる要約や言い換えを、そのまま正式Knowledgeへ登録しない。

役割を次のように分ける。

| 役割 | 作業 |
|---|---|
| 登録担当者 | FAQの新規入力、修正案、削除申請、根拠資料の提示 |
| 業務承認者 | 回答原文、料金、条件、例外、公開可否、適用日を確認して承認 |
| システム管理者 | 検証、Open Notebook反映、回帰テスト、旧版除去、記録 |

同一人物が複数の役割を持つ場合も、入力日と承認日を分けて記録する。

## 2. 管理ファイル

`evaluation/datasets/store-data.template.json`をコピーし、Git管理外の`evaluation/datasets/private/`で管理する。クライアントごと、改訂ごとにファイルを分ける。

```text
evaluation/datasets/private/
  store-v001.json
  store-v002.json
  prepared/
    store-v002/
```

FAQには次の情報を必ず記入する。

- `faq_id`: 改訂後も変えない一意ID
- `category`: 営業時間、アクセス、料金、予約、キャンセルなど
- `question_variants`: 顧客が使う質問表現
- `approved_answer`: クライアントが承認した回答原文
- `conditions`: 対象者、曜日、プラン、期間など
- `exceptions`: Botでは判断せず有人対応にする例外
- `public`: Botが回答に使用してよい場合だけ`true`

電話番号、個人名、メール、内部手順などは、公開承認を得るまで`public: false`にする。

## 3. 新規登録

1. 登録担当者が新しい`faq_id`を採番し、質問表現、回答、条件、例外、公開可否を入力する。
2. 業務承認者が根拠資料と照合し、ルートの`approved_by`、`approved_at`、`effective_from`、`store_revision`を更新する。
3. システム管理者が次を実行する。

```powershell
npm run store-data:validate -- evaluation/datasets/private/store-v002.json
npm run store-data:prepare -- evaluation/datasets/private/store-v002.json evaluation/datasets/private/prepared/store-v002
```

4. `manifest.json`の入力SHA-256、公開FAQ数、除外数を確認する。
5. `knowledge.md`を人が読み、承認原文、数字、税込・税別、曜日、条件、例外が欠けていないことを確認する。
6. Open Notebook管理画面で`[カテゴリ] faq_id revision`をタイトルにしてSourceを登録し、`knowledge.md`の該当FAQ本文を投入する。
7. Sourceの処理完了とEmbedding完了を確認し、FAQ ID、Source ID、revision、入力SHA-256、反映日時、作業者を対応表へ記録する。
8. 代表質問とGolden Datasetを実行し、Critical誤回答0件を確認して公開する。

登録操作だけで公開完了としない。Embeddingと回帰試験が終わるまでは反映作業中として扱う。

## 4. 既存FAQの変更

1. `faq_id`は変えず、新しい`store_revision`のJSONへ現在値をコピーする。
2. 変更箇所、変更理由、適用開始日、旧版の失効日時を記録する。
3. 業務承認者が変更後の回答と、変更していない条件・例外も含めて再承認する。
4. 検証・変換コマンドを実行し、旧manifestと新manifestのSHA-256が異なることを確認する。
5. BotのKnowledge更新時間を決め、更新中は顧客へ旧版と新版が混在しないようにする。
6. Open Notebookから旧Sourceの本文とSource IDを検索外バックアップへ記録する。
7. 旧Sourceを検索対象から削除し、新Sourceを登録してEmbedding完了を確認する。
8. 変更対象、関連カテゴリ、対象外質問の回帰テストを行う。
9. 旧料金・旧時間・旧条件が検索結果と回答に残っていないことを確認する。
10. 合格後に対応表のSource IDとrevisionを新しい値へ更新する。

Open Notebook全体検索を使うため、旧Sourceを別Notebookへ移すだけでは無効化にならない。旧版を検索対象に残したまま新版を追加しない。

## 5. FAQの削除・公開停止

1. 登録担当者が対象`faq_id`、削除理由、停止希望日を申請する。
2. 業務承認者が「完全削除」「Bot回答だけ停止」「別FAQへ統合」のどれかを指定する。
3. Bot回答だけ停止する場合は、次revisionのJSONで`public: false`にする。FAQレコード自体は監査用原本に残す。
4. Open Notebookで該当Source IDを照合し、誤ったSourceを削除しないようタイトルと本文を再確認する。
5. Sourceを削除し、検索結果から消えたことを確認する。
6. 削除対象の質問を実行し、旧回答を返さず、対象外回答または有人案内になることを確認する。
7. 削除日時、承認者、作業者、旧Source ID、確認結果を対応表へ記録する。

削除前に他のFAQが同じSourceへ混在している場合は、そのSourceを直接削除しない。残すFAQだけで新Sourceを作り、回帰後に旧Sourceを削除する。

## 6. ロールバック

新版の回帰に失敗した場合は公開を中止し、新版Sourceを削除する。検索外に保存した旧承認本文から旧Sourceを再登録し、Embeddingと代表質問を確認する。古いJSONを機械的に上書きせず、復旧したSource IDを対応表へ記録する。

## 7. 変更ごとの合格条件

- クライアントの業務承認者と承認日時がある。
- `store-data:validate`が成功する。
- 非公開FAQが`knowledge.md`へ含まれない。
- 登録Sourceが処理・Embedding完了になっている。
- Source ID、revision、入力SHA-256を記録している。
- Critical誤回答が0件である。
- 変更後に旧情報が検索・回答へ残っていない。
- 削除時は対象質問で旧回答が返らない。

## 8. 禁止事項

- AIが生成した回答を承認なしで登録する。
- 口頭依頼だけで料金、予約条件、キャンセル条件を変更する。
- 実店舗JSON、顧客情報、APIキー、生成した評価結果をGitへ追加する。
- 旧版と新版を同時に検索対象へ残す。
- Source IDを確認せず削除する。
- 回帰テスト前に本番反映完了と扱う。

