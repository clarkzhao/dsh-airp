# ADR-0009：产品角色是两个 AIRP preset；能力在 Host 插件 `dsh-airp`

- 状态：Accepted
- 日期：2026-08-18
- 决策者：clark（Q2-A, Q11-A, Q17-A）

## 背景

DSH 官方「创造模式」是 preset `cordis`（外加用户的 `anchored-creative`），能力是 `cordis_*` 热改运行时，不是「写一个故事世界」。两个带 `tool-cordis` 的 preset 在同一进程互斥。会话一旦有产出就不能热换 preset。

## 决策

1. 产品身份：
   - `airp-play`：消费者。默认 IC 文本，斜杠为导演。
   - `airp-author`：创造者。改同一世界包、校验、试跑。
2. 官方 `cordis` / `anchored-creative` **只用于开发 `dsh-airp` 本身**，不进玩家/作者故事会话。
3. 领域行为只在 `WorldKernel`（`match` / `turn`）。Host 插件里的 `DshHostAdapter` 把工具名和斜杠译成 intent，并把 `StoryEvent` 写入 session。两个 preset 只做可见性掩码，不各写一套引擎。
4. v0：
   - play 可见：`lore` / `look` / `check` / `fact` 工具，以及 `/gm` `/correct` `/retry` `/ooc`
   - author 另可见 `pack.validate`
   - **不做** `canon.edit`、`check.define`（作者改文件，新会话装新 Canon）
   - `/retry` = `sessions.fork`，不是 Kernel 的 turn
   - 两边都没有 bash、没有 `cordis_*`、play 不能写 Canon

## 后果

- 换身份 = 新会话（或空白会话 `recompose`），不能在同一条已产出记录上热切。
- 开发期仍可能撞上 `tool-cordis` 单例；AIRP 会话因不含该行而可与开发会话并存（只要开发会话自己协调）。

## 重新打开条件

- 若 DSH 日后允许有产出会话安全热切工具面，可再评估「一个 preset + 平面切换」。
