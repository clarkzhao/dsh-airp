# packs/

世界包是数据，不是插件代码。

| 目录 | 谁维护 | 进 git 吗 |
|---|---|---|
| `packs/lotm-tingen` | 官方 demo | 是 |
| `packs/jzdh-dingjiang` | 官方 demo | 是（设定集 `_extract.md`、按章审计 `audit/`，均不进 lore） |
| `packs/<你的 id>` | 你 | 默认否（见根目录 `.gitignore`） |
| `~/.dsh/airp-packs/<id>` | 你 | 永远不在本仓 |

消费者开局卡会同时列出仓内 demo 和 `~/.dsh/airp-packs/` 里能通过 `pack_validate` 的包。也可以粘贴任意含 `pack.yaml` 的目录。

分享：复制 `templates/community-pack/`，或把整个包目录打成 zip / 开独立 git 仓。别人解压到 `~/.dsh/airp-packs/<id>/` 即可玩。提交前跑 `npm run pack:validate -- <dir>`。不要把社区包直接 PR 进本仓的 `packs/`，除非它要成为第二个官方 demo。
