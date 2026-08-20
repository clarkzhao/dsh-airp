# 贡献

引擎改动走 PR。世界包默认**不要** PR 进 `packs/`。

## 玩 / 装自己的包

1. 复制 `templates/community-pack/` 到 `~/.dsh/airp-packs/<id>/`，或开 `airp-author` 走八问。
2. `npm run pack:validate -- ~/.dsh/airp-packs/<id>`
3. 新开 `airp-play`，开局卡选包或粘贴路径。

## Issue 标签

| 标签 | 用在 |
|---|---|
| `pack` | demo 设定、预算、委托不可玩 |
| `authoring` | 八问、scaffold、校验文案、交接卡 |
| `engine` | Kernel / 鉴定 / `/retry` |
| `docs` | README / 写包指南看不懂 |
| `demo` | 官方示例坏了（委托不可玩）。不要借机加全书剧情

社区包用 `pack` + 仓库/路径，不要把 zip 糊进本仓。

## PR

- 引擎：只打 `TurnResult` / `PackDiagnostic`，不要为了测试暴露 fold。
- 官方 demo 可以改 lore/check；社区包请独立仓库。
- 不要在 `airp-play` 里加 bash / `cordis_*`。
- 角色卡不写进度数字。
