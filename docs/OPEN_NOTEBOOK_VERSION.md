# Open Notebookバージョン記録

| 項目 | 値 |
|---|---|
| 選定版 | 1.14.0 |
| Git tag commit | `30c7e2a63e43b7f270fc2c638f0b6246934a53f4` |
| Docker image | `lfnovo/open_notebook:1.14.0` |
| Docker image digest | `sha256:e53f90d6153fcf4a64604d9a0c12cb0428a32cfb8dbcbb72e81ab12c013ee330`（multi-arch index） |
| SurrealDB image | `surrealdb/surrealdb:v2`（公式v1.14.0 Compose準拠） |
| SurrealDB digest | `sha256:d653f6c8a89e81f865ee31cd2f587c50f50ace922175e04150b1e385d2f86011`（multi-arch index） |

OCI補助コンテナも、Cloudflared `2026.9.1`を`sha256:b269e8abd07a5bf6f3f4be65d5050b2174eca89c56a0241a8ff32a16aec454e4`、Caddy `2.10.2-alpine`を`sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`へ固定する。いずれも2026-09-13にmulti-arch indexを確認した値であり、Arm64実機の起動確認後に提出版の記録と照合する。
| Health | 未確認（Docker engine未起動） |
| OpenAPI | 未保存（Docker engine未起動） |

Open Notebookの`latest`、`v1-latest`、開発版タグは使用しない。
