# PoC提出レポート

## 1. 提出範囲

- LINE 1対1テキスト問い合わせ
- Cloudflare Tunnel経由のWebhook
- OCI暫定運用（開発期間＋納品後1か月）
- Open Notebook RAG、Groq 120B、Gemini Embedding
- Bridgeによる安全判定、3ラリー、有人案内、緊急回答

## 2. 固定Revision

| 項目 | 値 |
|---|---|
| Open Notebook | 1.14.0 |
| Strategy / Answer / Final | 要実測記録 |
| Embedding | 要実測記録 |
| Knowledge revision | 実店舗データ受領後に確定 |
| Query mode | 要確定 |
| Prompt revision | 要確定 |
| Dataset revision | 要確定 |

## 3. 受入れ結果

| 試験 | 結果 | 証拠 |
|---|---|---|
| 実店舗Golden Dataset | 未実施 | 実データ受領待ち |
| LINE E2E | 一部確認済み | 正式記録待ち |
| 同時3件・10件Burst | ローカル自動試験PASS | OCI再試験待ち |
| 重複Webhook | ローカル自動試験PASS | LINE実試験待ち |
| Timeout・緊急回答 | ローカル自動試験PASS | OCI再試験待ち |
| 再起動復旧 | ローカル自動試験PASS | OCI再試験待ち |
| Cloudflare Tunnel障害 | 未実施 | 固定Tunnel作成待ち |
| バックアップ復元 | 未実施 | OCI作成待ち |

## 4. 品質・性能・費用

実店舗由来Golden Datasetの正答率、安全回答率、Critical件数、Source整合、人間採点、p50、p95、429率、Token usage、API費用を記録する。取得不能な値は0ではなく取得不能理由を記載する。

## 5. MMPとの差分

[MMP_REQUIREMENTS.md](MMP_REQUIREMENTS.md)の各項目について、実証済み、追加実装、運用補完、店舗承認待ち、既知制約へ分類する。

## 6. 納品後1か月の観測

OCIのCPU、メモリ、ディスク、ネットワーク、外形監視、停止・回収、回答Latency、復旧時間、実費を記録し、OCI継続・有料化・VPS移行を判定する。

## 7. 既知制約と最終判定

未実施項目を合格扱いにしない。PoCの技術合否とMMP提供可否を分けて記載する。
