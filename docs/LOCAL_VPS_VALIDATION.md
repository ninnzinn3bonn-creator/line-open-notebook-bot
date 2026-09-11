# ローカルVPS相当検証

ConoHa VPSを契約する前に、開発PC上の独立したDocker ComposeプロジェクトでOpen Notebookの実動作を確認する。この環境は本番データを使わず、外部公開もしない。

## 隔離範囲

- Composeプロジェクト名は`line-open-notebook-local-poc`に固定する。
- データは専用Docker named volumeへ保存し、通常開発環境およびVPS環境と共有しない。
- 公開ポートは`127.0.0.1`だけにbindする。LANやインターネットへ公開しない。
- Open Notebookは2.5GB、SurrealDBは768MBを上限とし、4GB VPS内で主要2サービスが収まる条件を近似する。
- 認証情報は`.env.local-poc`へ自動生成し、Git管理しない。

## 起動

PowerShellで次を実行する。

```powershell
.\scripts\local-poc.ps1 init
.\scripts\local-poc.ps1 pull
.\scripts\local-poc.ps1 up
.\scripts\local-poc.ps1 smoke
```

UIは`http://127.0.0.1:18502`、APIは`http://127.0.0.1:15055`で確認する。停止は`down`を使う。`reset`は専用volumeを削除するため、検証データが不要な場合だけ明示的に実行する。

## 合格ゲート

VPS構築へ進む前に、次を順番に満たす。

1. Open NotebookとSurrealDBがhealth状態になり、UIが開く。
2. `/health`、`/docs`、`/openapi.json`を取得できる。固定版のOpenAPIを保存し、SHA-256を記録する。
3. UIで外部AI ProviderとEmbeddingを登録し、Connection Testが成功する。
4. 承認済みの少数サンプルFAQを投入し、Source処理とEmbedding完了を確認する。
5. UIから代表質問に回答でき、根拠・応答時間・使用モデルを記録する。
6. 実OpenAPIに合わせて`OpenNotebookProvider`を実装し、Bridgeから同じ質問経路を呼び出せる。
7. コンテナ再起動後も設定とKnowledgeが残り、再度回答できる。

このゲートでは全30〜50問のモデル比較やLINE E2Eまでは行わない。API適合性と、VPSへ持ち込む構成が成立することを確定する。

## Windows前提

Docker DesktopのLinux containersを使うためWSL 2が必要になる。現在のPCは仮想化とHypervisorが有効で、メモリは約32GBある。WSL 2導入後にDocker Desktopを起動して上記手順を実行する。
