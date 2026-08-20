# AGENTS.md

给即将改这个仓的 coding agent：先读本文件。合同（Intent 全集、收据形状、对抗表）在 [`docs/engine.md`](docs/engine.md)。写包流程在 [`docs/worldbook-authoring.md`](docs/worldbook-authoring.md)。本文件不复述那些文档。

以**代码 + 本文件**为准。`docs/engine.md` §12 年表仍写「v0 没有 present port」——那是旧句；`present` 已在 `DEFAULT_GUARDED`，离场由 pack YAML 声明。

## 原则

1. **如无必要，勿增实体。** 不新开 play 工具、Intent 种类、Kernel port、世界名。先加深现有 Seam（`turn` / `match` / `indexText` / pack YAML）。一个 Adapter 不够开新 port。
2. **Pack 与引擎分界不要混。** 世界书（pack）写：场景/委托/公理/角色口吻、check 公式与 `outcomes.apply`、`places` 边与 `need`。AIRP（本仓引擎）写：双通道门禁、鉴定 AST、旅行图的**泛化**谓词、座位、brief、replay。包专属剧情、地名、谁该离场，不进 `src/kernel/`。引擎缺口不靠 lore 散文假装修过。
3. **体验测试优先于加代码。** (a) 用 subagent 分别扮 `airp-play` 消费者和 `airp-author` 创作者去跑、去体验。(b) 看轨迹里有没有世界不诚实（旧城规矩、幽灵在场、口头瞬移）。(c) 消费者觉得不对，先让创作者在权限内改 pack（YAML/MD、`pack_validate`）。(d) 创作者改不了（门禁、replay、座位、无工具可读卡）→ 给**本仓**提 `engine` issue，不要先改 Kernel 猜世界。

## 这是什么

AIRP = 一个深 Module `WorldKernel`（`match` / `turn`）+ 一层浅 DSH Host Adapter。LLM 提案和叙述；Kernel 把 State 从 T 写成 T+1。

两个 Preset：`airp-play`（消费者）/ `airp-author`（创造者）。Pack 是数据（YAML+MD），不是引擎。官方 demo `packs/lotm-tingen`、`packs/jzdh-dingjiang` 是夹具，不是产品线。用户包：`~/.dsh/airp-packs/<id>/`。不要把社区包 PR 进 `packs/`。

仓：https://github.com/clarkzhao/dsh-airp（public，topic `dsh-plugin`）。`main` 受保护：必须 PR、线性历史、禁止 force-push。引擎改动走 PR。本地可 commit。

## 命令

```bash
npm test                          # node --experimental-strip-types tests/*.test.ts
npm run typecheck                 # 可能在 boot 事件类型上红；不要把修 typecheck 当隐式任务
npm run build
npm run pack:validate -- <dir>
```

## Module / Interface / Seam / Adapter

**深 Module：`WorldKernel`**（`src/kernel/world-kernel.ts`，类型 `src/kernel/types.ts`）

Interface（调用方必须知道的全部）：

```text
match(state, tags, actors?) → ForcedCheck[]
turn(state, intent, options?) → TurnResult   # { ok, state, receipt, events }
```

`options` 可注入测试用的 `u` / `rng`。错误码见 `KernelErrorCode`（含 `CHANNEL_VIOLATION`、`EXTRA_GUARDED`、`INVALID_CONDITION`、`TRAVEL_BLOCKED`、`UNKNOWN_LORE`、`UNKNOWN_ACTOR`、`BUDGET`、`MISSING_REASON`、`UNKNOWN_CHECK`）。Implementation（公式求值、RNG 推导）不导出。重放在 Host，不在 Kernel。测试打 `TurnResult` / `PackDiagnostic`。

**浅 Adapter：DSH Host**（`src/host/runtime.ts` `boot.ts` `translate.ts`，挂载 `src/index.ts`）

把 DSH 工具 / 斜杠译成 `Intent`。`StoryEvent[]` 记在 Host 内存 `log`（不是 DSH session JSONL）。`/retry` = 按该 log replay（Kernel 不做时间旅行；DSH `sessions.fork` 若存在只分叉聊天日志）。常驻 brief：`systemPrompt.context('airp:index')` 每轮调 `indexText()`。

**Pack 装载 Seam**（`src/pack/pack.ts` `catalog.ts`）：`loadPack` / `validatePack` / `initialState` / `applySeating`。Canon 进 Kernel。**只有 Kernel 禁止世界名**；Host/Pack 开局文案可以写定江（`applySeating` 对 dingjiang 写 `arrival`，`boot.ts` 有定江座位卡）。

**加深现有 Seam，不开假缝。** 一个 Adapter 不够开新 port。新 play 工具、新 Intent 种类、Kernel 里的地名，默认都是错的 Depth。

## 不变量

- **双通道**：数值 / `scene` / `clock.beat` / 角色进度只经 `check` 或 `gm`。叙事经 `fact` / `correct`。碰 `DEFAULT_GUARDED` → `CHANNEL_VIOLATION`，State 不变。`check_propose` 的 extra patch 写 `present` → `EXTRA_GUARDED`。`present`：YAML/`gm` 可写；**IC 点名**走 Host `stageActors`（静默 push，无 check 事件）。`fact` 不能写 `present`。
- **禁止克隆受保护根**：`facts.scene` / `facts.present` / `facts.clock` 同样拒绝。
- **Kernel 纯洁**：不读盘、不碰 DSH、不写世界名。
- **Pack = 数据**：离场写 `present: "-{defender}"`；夜行写 `places.need: watch!=夜` 或 `mobility>=N`。引擎不猜谁该走。
- **鉴定**：`match` 跑完整 condition（含 `tag`）。显式 `check_propose` 跳过 `tag:`，仍验 `present` / eq / 比较。单人在场不把 `$defender` 填成自己。
- **自拟座位**：`applySeating` `mode=custom` → `present = [wanderer]`。轻松档用 `opening.present`。
- **召人**：IC 点名（host `stageActors`）或 `/gm present=+id :: 理由`。不 mint 新 id。新卡走 `airp-author` 改文件。
- **`lore_get`**：key 可以是 lore 或角色卡 id；收据仍 `kind: lore`；超预算 `BUDGET`；未知 `UNKNOWN_LORE`。
- **`/retry`**：replay 换场 extra（`scene`）；不要把 YAML `+0.15` 和 `clock.beat` 再喂一遍。

## 改哪里

| 你想动的 | 落点 | 不要 |
|---|---|---|
| 鉴定、guard、travel need、lore 预算 | `src/kernel/` | 世界名、ST 扫描器 |
| 工具名、brief、boot、replay、座位 | `src/host/` `src/index.ts` | 新 play 工具；play 里 bash / `cordis_*` |
| 装载、校验、scaffold、八问 | `src/pack/` | 把创造流程写进 Kernel |
| 官方夹具坏了 / 委托不可玩 | `packs/lotm-tingen` `packs/jzdh-dingjiang` | 借机加全书；commit `audit/`、`_extract.md` |
| 自己的世界 | `~/.dsh/airp-packs/` | PR 进 `packs/` |
| 合同、写包、贡献流程 | `docs/engine.md` 等 | 把那些文档粘进本文件 |

角色卡：口吻 / 外形 / 对外身份 / 底牌。进度数字只活在 State。一条 lore 一个概念；`index.scenes` 的 `foo.bar` 要有 `lore/foo-bar.md`（或父级 `foo.md`）。

Play 工具：`lore_get` `state_read` `check_match` `check_propose` `state_propose_fact`。Author 额外：`pack_validate` `pack_scaffold` `pack_open_play` `pack_interview`。`pack_open_play` **不**热切 preset。

## 怎么测

- **先体验，再单测。** 原则 3：play subagent 跑若干轮 → 轨迹不合理则 author 改 pack → 仍修不了再对本仓开 issue。官方 demo 当夹具体验可以；社区世界不要 PR 进 `packs/`。
- `npm test`。夹具打 `TurnResult` / `PackDiagnostic`。
- 新行为优先 `templates/community-pack` 变体或内存 Canon，不要往定江堆剧情断言。
- 官方 demo 回归：委托脊柱、travel 边、custom 座位、`CHANNEL_VIOLATION`。

Issue 标签：`engine` / `pack` / `authoring` / `demo` / `docs`（见 [`CONTRIBUTING.md`](CONTRIBUTING.md)）。

## 永远不要

- 复刻 ST 31 字段扫描器、`{{setvar}}`、Silly-Map、群聊发言权当世界规则。
- 在 Kernel 里写包专属逻辑（原则 2）。消费者的坑直接改引擎而不先问创作者（原则 3）。
- 为「可能用到」加工具或 port（原则 1）。
- 在角色卡里写序列 / 消化 / 品级进度。
- 把 `_extract.md` 编进 `index.yaml` 当运行时 Canon。
- 直推或 force-push `main`。

## 再读

- 合同：[`docs/engine.md`](docs/engine.md)
- 写包：[`docs/worldbook-authoring.md`](docs/worldbook-authoring.md)
- PR / 标签：[`CONTRIBUTING.md`](CONTRIBUTING.md)
- 下一刀：[`ROADMAP.md`](ROADMAP.md)
- 术语：[`docs/glossary.md`](docs/glossary.md)
