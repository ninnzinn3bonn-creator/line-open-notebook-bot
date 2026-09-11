# Open Notebook PoC向けVPS費用比較

調査日: 2026-09-11

## 結論

PoCはGPUなし、4 vCPU前後、メモリ4GBの国内Linux VPSから開始する。第一候補はKAGOYA CLOUD VPSの4GBプランとする。

Open Notebookの公式ドキュメントでは最小メモリが4GBとされている。今回の構成はOpen Notebook、SurrealDB、LINE Bridge、Reverse Proxyを同居させ、LLMとEmbeddingの推論には外部APIを使う。そのため4GBでPoCを開始できる見込みはあるが、余裕のある構成ではない。2GBまたは3GBへの減額は行わない。

## 4GBプラン比較

価格は各社公式ページの税込表示を基準とする。キャンペーン価格は継続費用の判断に使わない。

| 事業者 | 4GBプランの目安 | CPU | SSD | 契約上の特徴 | PoC判断 |
|---|---:|---:|---:|---|---|
| WebARENA Indigo | 月額上限1,630円 | 4 vCPU | 80GB | 時間課金、最低利用期間なし | 最安。80GBで足りる短期検証候補 |
| KAGOYA CLOUD VPS | 月額上限1,760円 | 4コア | 600GB NVMe | 日額63円、年額19,404円 | 第一候補。月130円差で容量に余裕がある |
| ConoHa VPS | おおむね月2,200円前後 | 4コア | 100GB | 長期一括割引あり | 管理画面や既存契約を優先する場合の候補 |
| XServer VPS | 1ヶ月2,640円、12ヶ月2,200円、36ヶ月2,035円 | 4コア | 150GB NVMe | 契約期間分を一括前払い | 長期契約なら候補。PoCの短期利用では割高 |
| さくらのVPS（石狩） | 月払い3,520円、年払い月額換算3,227円 | 4コア | 200GB | 4GBプランはSLA対象 | 安定性やSLA優先時の候補。今回の費用条件には高い |

公式料金ページ:

- [KAGOYA CLOUD VPS 料金・機能](https://www.kagoya.jp/vps/function-plan/)
- [WebARENA Indigo Linux料金](https://web.arena.ne.jp/indigo/price/)
- [ConoHa VPS 料金・スペック](https://vps.conoha.jp/pricing/)
- [XServer VPS 料金一覧](https://vps.xserver.ne.jp/price.php)
- [さくらのVPS 料金・仕様](https://vps.sakura.ad.jp/specification/)
- [Open Notebook System Requirements](https://github.com/lfnovo/open-notebook/blob/main/docs/1-INSTALLATION/index.md#system-requirements)

## 月額運用費の見込み

### 最小構成

| 費目 | 月額目安 | 備考 |
|---|---:|---|
| VPS | 1,760円 | KAGOYA 4GBを月額上限まで稼働 |
| HTTPS証明書 | 0円 | Let's Encryptを使用 |
| Reverse Proxy | 0円 | CaddyまたはNginxをDockerで稼働 |
| Open Notebook / SurrealDB / Bridge | 0円 | OSSを自己運用 |
| AI API | 従量 | GeminiまたはGroq。質問数、検索文量、選択モデルで変動 |
| ドメイン | 別途 | 既存ドメインのサブドメインを使えば追加費用なし |

VPS本体だけなら月1,760円、最低限の外部バックアップを含めても月2,000円前後を初期予算とする。AI API料金とLINE Messaging API料金は利用量に応じて別管理する。

## 月10人・1人5往復の場合のAI API概算

月10人、1人あたり5回の質問と回答を行う前提を、月50回答として計算する。標準ケースでは1回答あたり入力5,000 tokens、出力500 tokensとする。入力にはSystem Prompt、検索したKnowledge、質問、必要な会話履歴を含む。円換算は比較用に1 USD = 150円とする。

| モデル候補 | 公式単価（100万tokens） | 50回答・1モデル呼出し/回答 | 3モデル呼出し/回答の概算 |
|---|---:|---:|---:|
| Groq GPT-OSS 20B | 入力$0.075、出力$0.30 | 約4円/月 | 約12円/月 |
| Groq GPT-OSS 120B | 入力$0.15、出力$0.60 | 約8円/月 | 約24円/月 |
| Gemini 3.1 Flash-Lite | 入力$0.25、出力$1.50 | 約15円/月 | 約45円/月 |
| Gemini 3.7 Flash | 入力$0.75、出力$3.75（2026年末までの表示価格） | 約42円/月 | 約127円/月 |

公式単価:

- [Groq GPT-OSS 20B](https://console.groq.com/docs/model/openai/gpt-oss-20b)
- [Groq GPT-OSS 120B](https://console.groq.com/docs/model/openai/gpt-oss-120b)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)

Open Notebookの実APIでstrategy、answer、final answer等の複数呼出しが必要な場合に備え、表では3回分も示した。各段階の実トークン量は同一ではないため、これは上限寄りの比較値である。実装後はProviderが返すUsageを役割別に保存して実測へ置き換える。

Embeddingは`gemini-embedding-001`の有料単価が入力100万tokensあたり$0.15である。質問50件のEmbedding費用は1円未満になる見込みで、Knowledge 100万tokensを全件Embeddingしても約23円の一時費用である。

本番会話だけならAI API予算を月300円確保すれば余裕がある。PoCでは30〜50問を複数モデルで実行する回帰テストの方が本番会話より呼出し回数が多くなるため、月1回の回帰テストとLLM Judgeを含めて月1,000円をAI API予算の上限目安とする。無料枠は費用計画に含めない。

## バックアップ費用

VPSのスナップショットだけを唯一のバックアップにしない。SurrealDB export、設定ファイル、Knowledge原本を定期的に外部へ保存する。

- KAGOYAのスナップショットは保存容量10GBごとに日額4.4円。20GB使用なら約264円/30日が目安。
- WebARENA Indigoのスナップショットは月額上限5.5円/GB。80GB分なら最大440円/月が目安。
- PoC初期はデータ量が少ないため、アプリケーション単位の圧縮バックアップを優先する。
- 復元手順は提出前に1回実行して確認する。

## 4GBで運用する条件

- Ollama等のローカルLLMは置かず、LLMとEmbeddingは外部APIを使用する。
- Swapを2〜4GB設定し、OOMによるプロセス停止を避ける。ただしSwapを性能不足の解決策にはしない。
- Knowledge投入とEmbedding生成の並列数を1から開始する。
- `SURREAL_COMMANDS_MAX_TASKS`は1または2から測定する。
- Dockerコンテナごとのメモリ、ホストの空きメモリ、Swap使用量、OOM履歴を記録する。
- PDF等の一括投入とLINE回答を同時に負荷試験する。

次のいずれかが発生した場合は8GBへ上げる。

- OOM Killまたはコンテナの再起動が1回でも発生する。
- 通常時に使用メモリが継続して3.2GBを超える。
- Knowledge投入中にLINE回答が実用上の制限時間を超える。
- 回帰テストの並列実行によりSwap使用が常態化する。

KAGOYAの8GBは月額上限3,410円、年払いは月額換算3,135円である。最初から8GBを契約せず、4GBで実測して必要時に上げる。

## 採用方針

1. PoC用にKAGOYA CLOUD VPS 4GBを月額・日額課金で1台用意する。
2. Ubuntu LTSとDocker Composeで現行要件どおり構築する。
3. Open Notebook、SurrealDB、Bridge、Reverse Proxyを起動してアイドル時とKnowledge投入時のメモリを測る。
4. 4GBで成立すればそのまま提出候補とする。
5. 成立しない場合だけ8GBへ変更し、測定結果を提出資料へ記載する。

クライアントがすでにConoHaアカウントを所有している場合は、月数百円の差より所有権移管と請求管理の簡単さを優先し、ConoHa 4GBを採用してよい。
