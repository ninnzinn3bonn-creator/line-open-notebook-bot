# Open Notebook初期設定

1. Docker ComposeでOpen NotebookとSurrealDBを起動する。
2. `/health`、`/docs`、`/openapi.json`を確認し、`npm run inspect:openapi`でOpenAPIを保存する。
3. UIのManage → ModelsでProvider Credentialを追加する。APIキーをGit管理ファイルへ書かない。
4. Connection Testを実行し、成功したモデルだけを登録する。
5. Language、Embedding、Transformation、Large Context等の実際の役割と登録IDを記録する。
6. Embedding Modelを1つ固定し、少数のサンプルKnowledgeでSource処理と意味検索を確認する。
7. Ask APIのstrategy/answer/final answerのモデル指定、出典、Usage取得可否を実応答で確認する。
8. [KNOWLEDGE_DESIGN.md](KNOWLEDGE_DESIGN.md)に従い、承認済み実Q&Aを投入する。
9. 構成を固定した後、Golden Datasetを30〜50問以上へ整備して2モデル以上を評価する。

回答精度チェックはOpen Notebookを起動しただけでは完了しない。実Q&Aと別表現の評価質問、人間採点、モデル比較、Baseline保存までをPoCの品質確認とする。

