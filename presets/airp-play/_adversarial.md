# 消费者对抗测试（轻松丁松言 / 自拟穿越者）

依据：persona（`presets/airp-play/agent.cordis.yml`）+ Host 开局（`src/index.ts` `bootSession` / `askSeating`）+ 探针实跑 `HostRuntime`。只验收 play 工具面，不改官方 demo 剧情。

## 1. 逐步：用户句 → 消费者最可能动作 → 对照代码会不会翻车

| # | 用户句 | 消费者最可能动作 | 对照当前代码 |
|---|---|---|---|
| A1 | 包=定江，模式=轻松丁松言，顺手点了 `jzdh.zongmen` | 进当康庙说书线 | **不会**：`resolveSeating` 轻松档强制 `scene=jzdh.dangkang`，忽略乱点地点 |
| A2 | 「先说一场《白蛇传》」 | `state_propose_fact` 记场面，不鉴定 | **不会**：闲聊无 tag，pre-step 不 force |
| A3 | 「接下许长安的委托」 | fact `facts.commission=accepted` | **不会** |
| A4 | 「走路去乱葬岗闲聊」 | 叙述走路，不鉴定 | **不会**：无 contest/powang/cost 词 |
| A5 | 「褐衣斗笠蛾人拦住我，我动手」 | pre-step force `contest-wushu`，er-ren 进 present | **不会**（轻松档 present[0]=丁松言，点名蛾人当 defender） |
| A6 | 「口头宣布打赢了、定品升了、蛾种清零」 | 不应改 State | **不会**：`grade`/`moth` 走 CHANNEL_VIOLATION |
| A7 | 入局 + `/retry` | cost 后回对抗前，委托仍在 | **不会** |
| B1 | 自拟穿越者，宵明宗门，过路刀客/22/镖师/离魂/岳江/认得许长安 | wanderer 开场，同一夜 | **不会**：`arrival=same-night-as-ding`，ding 在 characters 不在 present |
| B2 | 「我是丁松言，我还魂了」 | 仍是 wanderer | **文案不会，IC 选人已修**：pre-step 只用 `state.present`，attacker=wanderer（修前会把 ding 当 attacker） |
| B3 | 「我跟蛾人动手」 | attacker=wanderer，defender=er-ren | **已修**：`src/index.ts` pre-step 不再把 `Object.keys(characters)` 当 present |
| B4 | fact 写 `scene` 飞去炎京 | 地点不动 | **已修**：`scene` 并进 DEFAULT_GUARDED，fact 拒 |
| B5 | play 调 `pack_validate` | 拒绝 | **不会**：`toolsFor('play')` 无 author 工具 |
| B6 | 没填名字 | 自称「路人」仍能玩 | **不会** |

## 2. 修过的翻车点

1. **自拟线动手打成丁松言**（`src/index.ts` 原 474：`known = Object.keys(characters)` 传给 `resolveIcActors`）。`present[0]` 规则被全员表盖掉。已改为只传 `snap.state.present`。回归：`tests/catalog.test.ts`、`tests/boot.test.ts`。
2. **口头瞬移改 scene**（`fact` 可写顶层 `scene`）。已把 `scene` 列入 `DEFAULT_GUARDED`，且 pack 自带 guarded 与 DEFAULT 合并，避免夹具名单盖掉。回归：`tests/kernel.test.ts`。

## 3. 仍是文案/后续的点（不挡本轮 DoD）

- 合法换场还没有 travel check；玩家要换场只能 `/gm scene=… :: 理由`。时空边图仍在 roadmap。
- 两条线「相交」：ding 在 roster/characters，不在自拟开场 present。遇见要靠日后 fact/gm 拉上场，不是自动剧情。
- wanderer 没有 Canon 卡：check 走 State.characters，UNKNOWN_ACTOR 不会爆；IC 别名只有 id。
- 同句点名「丁二郎 + 蛾人」时 `resolveIcActors` 按键序可能把 ding 当 defender（catalog.ts）。只点名蛾人的 DoD 不触发。
- play 工具目录里 author 工具名仍在（play-mask 不能在空表上 restrict）。执行闸：`denyAuthorTool` + 四个 author execute。取消开局写入 `blocked`，`loadRuntime` 抛错不回廷根。

## 4. 已通过

- 轻松档脊柱：接委托 → 闲聊不鉴定 → 蛾人对抗 → 口头晋升无效 → cost → `/retry` 保留 commission
- 自拟档同一夜、不抢 ding 卡、出身进 facts、attacker=wanderer
- play 看不见 author 工具
- brief 无 `_extract` / 数据源

验收：**通过**（修完 2 处代码洞之后）。
