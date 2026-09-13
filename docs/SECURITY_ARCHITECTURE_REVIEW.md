# セキュリティ・構成整合性レビュー

更新日: 2026-09-13

## 判定

OCI上のDocker Compose、Cloudflare Tunnel、LINE Messaging API、Open Notebook管理経路を見直した。PoCを進められる構成だが、Cloudflare側の設定検証と実機での復元試験が完了するまでは本番相当とは判定しない。

## 信頼境界

| 経路 | 到達先 | 防御 |
|---|---|---|
| LINE → Cloudflare | `/webhooks/line`のみ | POST限定、1 MB上限、LINE署名検証、Webhook ID重複排除 |
| 監視 → Cloudflare | `/health`のみ | GET/HEAD限定、内部構成を返さない |
| 管理者 → Cloudflare Access | Open Notebook UI/API | Access許可ユーザー＋Open Notebookパスワード |
| Bridge → Open Notebook | Docker内部API | 非公開ネットワーク、外部ポートなし |
| Open Notebook → SurrealDB | Docker内部DB | 非公開ネットワーク、外部ポートなし |
| 評価・管理操作 → Bridge | `/internal/*` | Bearer token、公開ルーターに経路なし |

## 今回修正した重大事項

- OCI用BridgeへモデルID、管理トークン、回答方針、有人移管設定を渡し、起動時の設定矛盾を解消した。
- Tunnel tokenをコンテナのコマンドラインから外し、権限600のDocker secretファイルで渡すようにした。
- Tunnel、公開ルーター、Bridge、Open Notebook、SurrealDBを用途別ネットワークへ分離した。TunnelからBridgeとDBへ直接到達できない。
- `/internal/answer`へBearer認証を追加し、評価Runnerも同じ認証を使用するようにした。
- Open Notebookの外部URLとCORSを管理ホスト名へ統一した。
- 公開ヘルスチェックから利用中Provider名を除去した。

## 外部設定で必ず確認する事項

1. Tunnelの公開ホストは`PUBLIC_HOST → http://edge-router:8080`、管理ホストは`OPEN_NOTEBOOK_ADMIN_HOST → http://open-notebook:8502`だけにする。
2. Open Notebook管理ホストを公開する前にCloudflare AccessのSelf-hosted applicationと管理者限定Allow policyを作る。未ログイン、許可外アカウント、別端末で拒否されることを確認する。
3. Bridge、SurrealDB、Open Notebook APIポート5055へのPublic Hostnameを作らない。
4. OCI Security List/NSGはインターネットから80、443、3001、5055、8000、8502を許可しない。SSHは管理元IPへ限定する。
5. LINE DevelopersのWebhook URLは公開ホストの`/webhooks/line`だけを指定し、署名不正要求が401になることを実測する。
6. Cloudflareのアカウント設定でAccess保護のないTunnel公開経路を拒否する設定を検討し、管理ホストの設定漏れを検知する。

## 残存リスクとPoCでの扱い

| 優先度 | リスク | PoCでの扱い |
|---|---|---|
| 高 | Access policyの誤設定で管理画面が公開される | 展開チェックリストと外部からの拒否試験を合格条件にする |
| 高 | バックアップスクリプトは実装済みだが実機復元が未検証 | OCI実機の新規データ領域でバックアップ／復元試験を行う |
| 中 | 固定したmulti-arch image digestのArm64起動が未確認 | OCI Arm64で4イメージを起動し、提出版の記録と照合する |
| 中 | 有効なWebhookの再送・大量送信でキューが増える | ID重複排除を維持し、負荷試験後にCloudflare rate limitを決める |
| 中 | OCIホストのroot権限取得時は環境変数やデータを読まれる | SSH鍵、管理元IP制限、OS更新、最小権限運用を納品条件にする |
| 中 | Open Notebook UIとAPIが同一コンテナであり管理APIだけを細分化できない | 管理ホスト全体をAccessで保護し、将来必要なら別管理Proxyを追加する |

## 合格条件

- `docker compose config`でホスト公開ポートがなく、Tunnelが`backend`と`app-edge`へ参加していない。
- 公開ホストでWebhook POSTとhealth GET/HEAD以外が404になる。
- 管理ホストはCloudflare Access未認証で拒否される。
- LINE署名不正は401、正しい実端末イベントは200となり返信は1回だけ届く。
- `/internal/*`は公開ホストから到達不能で、内部でもBearer tokenなしは401となる。
- バックアップから新規ボリュームへ復元し、Knowledgeと保留キューを確認できる。
