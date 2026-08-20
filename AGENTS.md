# AGENTS.md

给即将改这个仓的 coding agent：先读本文件。合同（Intent 全集、收据、对抗表）在 [`docs/engine.md`](docs/engine.md)；写包在 [`docs/worldbook-authoring.md`](docs/worldbook-authoring.md)。以**代码 + 本文件**为准。`engine.md` §12 仍写「v0 没有 present port」——旧句；`present` 已在 `DEFAULT_GUARDED`，离场由 pack YAML 声明。

## 原则

1. **如无必要，勿增实体。** 不新开 play 工具、Intent 种类、Kernel port、世界名。先加深 `turn` / `match` / `indexText` / pack YAML。一个 Adapter 不够开新 port。
2. **Pack 与引擎分界不要混。** 世界书写场景/委托/公理/口吻、check 公式与 `outcomes.apply`、`places` 边与 `need`。本仓引擎写双通道、鉴定 AST、旅行图的**泛化**谓词、座位、brief、replay。包专属剧情、地名、谁该离场，不进 `src/kernel/`。引擎缺口不靠 lore 散文假装修过。
3. **体验测试优先于加代码。** (a) subagent 分别扮 `airp-play` 与 `airp-author` 去跑。(b) 看轨迹是否世界不诚实。(c) 消费者觉得不对，先让创作者改 pack。(d) 创作者权限内改不了 → 给**本仓**提 `engine` issue，不要先改 Kernel 猜世界。

## 这是什么

AIRP = 深 Module `WorldKernel`（`match` / `turn`）+ 浅 DSH Host Adapter。LLM 提案和叙述；Kernel 把 State 从 T 写成 T+1。

Preset：`airp-play` / `airp-author`。官方 demo 是示例包，不是产品剧情。用户包：`~/.dsh/airp-packs/<id>/`。https://github.com/clarkzhao/dsh-airp。长期目标：**打出基本可用 tag `0.1.0`**（边界见 [`ROADMAP.md`](ROADMAP.md)）。`main`：PR、线性、禁止 force-push。

## 命令

```bash
npm test                          # tests/*.test.ts
npm run typecheck                 # 可能红；不要当隐式任务
npm run build
npm run pack:validate -- <dir>
```

## Module / Interface / Seam / Adapter

**`WorldKernel`**（`src/kernel/world-kernel.ts`，`types.ts`）

```text
match(state, tags, actors?) → ForcedCheck[]
turn(state, intent, options?) → TurnResult   # { ok, state, receipt, events }
```

`options` 可注入 `u` / `rng`。错误码见 `KernelErrorCode`。重放在 Host。测试打 `TurnResult` / `PackDiagnostic`。

**Host Adapter**（`src/host/runtime.ts` `boot.ts` `translate.ts`，`src/index.ts`）：工具译成 `Intent`。`StoryEvent[]` 在内存 `log`，不是 DSH JSONL。`/retry` 按该 log replay（`sessions.fork` 只分叉聊天）。brief：每轮 `indexText()`。

**Pack Seam**（`src/pack/pack.ts` `catalog.ts`）：`loadPack` / `validatePack` / `initialState` / `applySeating`。**只有 Kernel 禁止世界名**；Host/Pack 开局可以写定江（`arrival`、座位卡）。

## 不变量

- **双通道**：数值 / `scene` / `clock.beat` / 角色进度经 `check` 或 `gm`；叙事经 `fact` / `correct`。碰 `DEFAULT_GUARDED` → `CHANNEL_VIOLATION`。extra patch 写 `present` → `EXTRA_GUARDED`。`present`：YAML/`gm` 可写；IC 点名走 `stageActors`（无 check 事件）；`fact` 不能写。
- **禁止** `facts.scene` / `facts.present` / `facts.clock`。
- Kernel 不读盘、不碰 DSH、不写世界名。
- **鉴定**：`match` 跑完整 condition。`check_propose` 跳过 `tag:`，仍验 present/eq/比较。单人在场不把 `$defender` 填成自己。
- **自拟**：`present = [wanderer]`。轻松档用 `opening.present`。
- **召人**：点名或 `/gm present=+id :: 理由`。不 mint；新卡走 author 改文件。
- **`lore_get`**：lore 或角色卡 id；收据仍 `kind: lore`。
- **`/retry`**：回放换场 `scene` extra；不要再喂 YAML `+0.15` 和 `clock.beat`。

## 改哪里

| 你想动的 | 落点 | 不要 |
|---|---|---|
| 鉴定、guard、travel need、lore 预算 | `src/kernel/` | ST 扫描器 |
| 工具名、brief、boot、replay、座位 | `src/host/` `src/index.ts` | 新 play 工具；play 里 bash / `cordis_*` |
| 装载、校验、scaffold、八问 | `src/pack/` | 创造流程写进 Kernel |
| 官方示例坏了 | `packs/lotm-tingen` `packs/jzdh-dingjiang` | 借机加全书；commit `audit/` |
| 自己的世界 | `~/.dsh/airp-packs/` | PR 进 `packs/` |
| 合同、写包、贡献 | `docs/` `CONTRIBUTING.md` | 粘进本文件 |

角色卡：口吻 / 外形 / 对外身份 / 底牌。进度只在 State。一条 lore 一个概念；`foo.bar` 要有 `lore/foo-bar.md`。

Play：`lore_get` `state_read` `check_match` `check_propose` `state_propose_fact`。Author 另有 `pack_validate` `pack_scaffold` `pack_open_play` `pack_interview`。`pack_open_play` 不热切 preset。

## 怎么测

先体验（原则 3），再 `npm test`。新行为用 `templates/community-pack` 或内存 Canon。Issue 标签见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 永远不要

- ST 31 字段扫描器、`{{setvar}}`、Silly-Map、群聊发言权当世界规则。
- 原则 1–3 的反面（加实体、包逻辑进 Kernel、跳过创作者直接改引擎）。
- 卡里写进度数字。把 `_extract.md` 编进 `index.yaml`。

## 再读

[`ROADMAP.md`](ROADMAP.md)（0.1.0 边界）· [`docs/glossary.md`](docs/glossary.md)
