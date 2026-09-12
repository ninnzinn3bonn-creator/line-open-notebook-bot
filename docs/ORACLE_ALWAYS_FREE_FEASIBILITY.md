# Oracle Cloud Always Free 技術検証

調査日: 2026-09-12

## 結論

Open Notebookを前提とする本PoCは、Oracle Cloud Infrastructure（OCI）のAmpere A1 Always Free上で技術的に動作する可能性が高い。推奨候補はUbuntu Arm64、2 OCPU、8〜12GB RAM、50〜100GB Boot Volumeの単一VMで、現在のDocker Compose構成を維持する。

ただし、クライアント向けの常時稼働基盤としてConoHa VPSを完全に置き換える判断はしない。Always Freeにはリージョン内の在庫不足、低利用インスタンスの回収、無償利用者の公式サポート対象外という運用上の制約がある。本Botの想定利用量は月10人・各5ラリー程度であり、低利用回収条件へ入りやすい。

採用判断は次のとおりとする。

| 用途 | 評価 | 判断 |
|---|---|---|
| 開発・検証 | 高 | 容量を確保できれば採用可能 |
| PoCデモ | 中〜高 | 外部バックアップとConoHa復旧手順を用意して採用可能 |
| クライアント常時運用 | 中〜低 | 無償枠だけを唯一の基盤にしない |
| コスト削減 | 高 | Compute・対象ストレージを枠内に収めればインフラ部分をほぼ0円化可能 |

## 公式枠の確認

2026年6月更新のOCI Free Tier文書では、Always FreeアカウントのAmpere A1はテナンシ全体で2 OCPU、12GB RAM相当である。Always Free Computeはhome regionだけで作成でき、home regionは後から変更できない。

Always Free対象のBlock Volumeは合計200GB、バックアップは5個で、Boot Volumeの最小は約47〜50GB。20GBのObject Storageも利用できる。公式価格ページには有料テナンシ向けA1の月間無料量として3,000 OCPU時間・18,000 GB時間も掲載されているが、純粋なAlways FreeアカウントについてはFree Tier文書の2 OCPU・12GBを設計上限として扱う。

参考:

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- https://docs.oracle.com/pt-br/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/jp/cloud/price-list/
- https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingregions.htm

## Arm64互換性

2026-09-12にコンテナmanifestを直接検査した。

| コンテナ | 固定版 | linux/arm64 | 結果 |
|---|---|---:|---|
| Open Notebook | `lfnovo/open_notebook:1.14.0` | あり | PASS |
| SurrealDB | `surrealdb/surrealdb:v2` | あり | PASS |
| Bridge基盤 | `node:24.13.0-bookworm-slim` | あり | PASS |
| HTTPS | `caddy:2.10.2-alpine` | あり | PASS |

Open Notebook 1.14.0のArm64 manifestは`sha256:3b813dc6e17a71848ea642b03d9036cf960282ac58fa7d0df1ef3e6ba970e1c4`、SurrealDB v2は`sha256:8893ff5a5b776d06b47ad4a42269011c81256fb9489b5d397f6e873240557694`だった。BridgeのNode基盤とCaddyにもArm64版がある。

Bridgeは`better-sqlite3`を含むため、最終判定ではA1実機上の`docker compose build`を実施する。ローカルでArm64クロスビルドを試みた時点ではDocker Engineが停止しており、ビルド完走確認は未実施。manifest確認だけを実機動作確認とは扱わない。

Open Notebook公式Package:

- https://github.com/lfnovo/open-notebook/pkgs/container/open-notebook

## 推奨VM構成

```text
Shape: VM.Standard.A1.Flex
Architecture: Arm64
OS: Ubuntu LTS Arm64
OCPU: 2
RAM: 8〜12GB
Boot Volume: 50〜100GB
Public IP: 1
Public ports: 22, 80, 443
Private Docker ports: 3001, 5055, 8000, 8502
```

Groq 120BとGemini Embeddingは外部APIを使うため、GPUは不要。月10人・各5ラリーではCPUより、外部APIのLatencyと可用性が支配的になる。2 OCPUでもPoCの逐次処理は現実的だが、10件Burst時の処理時間はA1実機で再測定する。

## 既存構成への変更

アプリケーション構造は変更しない。Open Notebook、SurrealDB、Bridge、Caddyを同一Docker Composeで動かす。必要な変更はデプロイ対象OSとCPUアーキテクチャ、OCIネットワーク設定、バックアップ先である。

ConoHa用`bootstrap-conoha.sh`を直接流用せず、次をOCI用スクリプトとして分離する。

- Ubuntu Arm64へのDocker導入
- OCI VCN Security ListまたはNetwork Security Groupで22/80/443を許可
- Ubuntu側firewallでも同じポートだけを許可
- Boot Volume backupまたはObject Storageへの暗号化バックアップ
- Arm64でのCompose build、Health、OpenAPI、42問回帰、LINE E2E

## 最大の制約

### 1. 低利用インスタンスの回収

OracleはAlways Free Computeについて、7日間の95パーセンタイルCPU使用率が20%未満、ネットワーク使用率が20%未満、A1ではメモリ使用率も20%未満の状態を低利用とし、回収する場合があると明記している。本Botは少数利用なので該当可能性が高い。

回収を避ける目的で無意味なCPU・ネットワーク負荷を生成しない。代わりに外部バックアップ、再構築スクリプト、DNS切替、ConoHaまたはOCI有料VMへ復旧できる手順を用意する。

### 2. Capacity不足

Always Free Shapeはhome regionで`Out of host capacity`となる場合がある。Oracleは別Availability DomainやFault Domain、時間を変えた再試行を案内しているが、Free TierではCapacity Reservationを利用できない。必要日に必ず作れる保証はない。

### 3. サポート

Always Freeだけを使うアカウントはOracle Supportへサービスリクエストを出せず、Community Supportが基本になる。障害時の復旧責任をクライアントへ説明する必要がある。

### 4. 課金事故

Always Free対象ラベル、home region、Shape、OCPU、RAM、Block Volume総量を確認する。Free Trialの有料リソースはTrial終了後に回収され得る。予算アラートとCompartment quotaを設定し、Always Free対象外のLoad Balancer、追加Volume、バックアップ、IPを無計画に作らない。

### 5. データ保全

VMまたはBoot Volumeの消失を前提に、SurrealDB、Open Notebookデータ、Bridge SQLite、設定の暗号化バックアップをVM外へ保存する。APIキーをバックアップ本文へ平文で入れない。Object Storageの無料枠だけに依存せず、PoC提出時点の復旧可能なコピーを別管理する。

## ConoHaとの比較

| 観点 | OCI Always Free A1 | ConoHa 4GB VPS |
|---|---|---|
| 月額インフラ | 枠内ならほぼ0円 | 約2千円台を想定 |
| CPU/RAM | Arm 2 OCPU、最大12GB設計 | x86、4GB |
| コンテナ互換性 | Arm64確認が必要。本構成の主要imageは対応 | 現行ローカル環境に近い |
| 容量確保 | 在庫不足あり | 契約できれば比較的確実 |
| 低利用回収 | あり | 通常なし |
| 公式サポート | 無償利用は限定的 | 契約サービスのサポート |
| 顧客向け可用性 | 単独採用は弱い | 主基盤にしやすい |

外部AI API、ドメイン、LINEプランの料金はどちらでも別に発生する。OCIへ変更して削減できるのは主にVPS本体と枠内ストレージの料金である。

## 検証ゲート

OCI案を採用する場合、次を全て通過してからConoHa案を置き換える。

1. 希望home regionでA1 2 OCPU・8〜12GBを確保できる。
2. A1実機でBridge imageをビルドできる。
3. Open Notebook、SurrealDB、Bridge、Caddyが全てhealthyになる。
4. OpenAPI hashと固定image digestを記録する。
5. 合成42問、3ユーザー同時、10件Burst、Timeout、再起動復旧が合格する。
6. LINE実端末E2Eが合格する。
7. VM外バックアップから復旧できる。
8. 回収時の復旧目標時間とConoHaへの切替判断を決める。

現時点の推奨は、OCI A1を無料PoC・パイロット候補として実機検証し、ConoHa 4GBを確実な代替先として設計に残すことである。
