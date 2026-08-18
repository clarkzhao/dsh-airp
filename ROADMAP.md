# Roadmap

不是承诺表。用来告诉社区「现在能提什么 issue、不该提什么 PR」。

## 现在（v0）

- [x] `WorldKernel`：`match` / `turn`，双通道，事件溯源
- [x] Host adapter：工具翻译、开局选包、`/retry` fork
- [x] 官方 demo：`lotm-tingen`、`jzdh-dingjiang`
- [x] 开放包发现：bundled + `~/.dsh/airp-packs` + 自定义路径
- [x] 创造者：ask-user 八问 + `pack_scaffold` + `pack_validate`
- [x] 文档：`docs/engine.md`、`docs/worldbook-authoring.md`、ADR 0008–0011

欢迎的 issue：

- `engine`：Kernel 门禁、鉴定公式、事件回放
- `pack`：demo 设定错误、条目超预算、委托不可玩
- `authoring`：八问不够用、scaffold 缺字段、校验诊断难懂
- `docs`：社区看不懂怎么装自己的包

不欢迎的 PR：

- 把社区世界包直接塞进 `packs/`（请独立仓库 / zip）
- 复刻 SillyTavern 31 字段扫描器、宏、`{{setvar}}`
- 在 play preset 里加 `cordis_*` 或 bash
- 把角色进度写进 Canon 卡

## 下一步（v0.2）

- [x] 包清单卡显示 title / license / 来源
- [x] `pack_validate` 检查 lore 预算、一条一概念、角色卡误写进度、缺委托
- [x] 开场 `present` 与 `roster` 分离；IC 按名字选对手，不误伤在场盟友
- [x] 创造者写完后 `pack_open_play` 交接卡（新开 airp-play，不热切本会话）
- [x] 社区包模板 `templates/community-pack` + `npm run pack:validate` + GitHub Actions
- [x] `pack_interview`：8 问是数据，不是 persona 记忆；答案驱动 scaffold
- [x] 定江补场景 lore：当康庙 / 乱葬岗
- [x] 八问拆成两屏；`index.scenes` 要对 lore 文件；Issue 模板 + CONTRIBUTING
- [x] GitHub 标签 `pack` / `authoring` / `engine` / `demo` / `docs`
- [x] 开场 brief 按包装配场景 lore、委托、鉴定词，不再写死廷根
- [x] scaffold 写出场景 lore；创造者 preset 挂 `worldbook-authoring` skill

## 现在（v0.3）— 加深现有缝，不开假缝

原则：`WorldKernel.turn/match` 与 `Pack.load/validate` 已经是深 module。下一步只往这两个 interface 后面加行为。不要为「设定集很长」再开 `present` / `canon.edit` / Worldsmith port——那是 engine.md §12 的 v1，且目前只有一个 adapter。

1. **把定江设定集压回可玩 Canon**（`pack` / `demo`）
   - `_extract.md` 是作者工作稿，不是运行时。拆进现有 `lore/*.md`（一条一概念、硬预算），索引只加本切片会取到的 key。
   - 开局委托仍是「张睿失踪 → 乱葬岗蛾人」。卷二以后的梦劫、夺舍、魔种、潜蛟只进 [GM] 或未揭示 lore，不进 `opening.revealed`。
   - 角色卡继续不写进度。季寒衣 / 覃观蝉 / 黄粱不进开局 `present`。
   - DoD：`pack_validate` 过；`jzdh.test.ts` 脊柱仍是 fact → contest → cost → `/retry`。

2. **加深 `Pack.validate`，而不是新工具**（`authoring`）
   - 在现有诊断码上加：开局 `revealed` 总字数、lore 互指死链、check `when` 在 brief 里找不到、`_extract.md` 误进 index。
   - 创造者八问保持 2×4；不要为「大荒全书」加第三屏。
   - DoD：坏包只出 `PackDiagnostic`；测试仍打 `load/validate`，不打 fold。

3. **加深 `WorldKernel.turn` 的可观察收据**（`engine`）
   - 第一刀因果抽查：叙述声称晋升 / 定品 / 造窍，但本回合 `events` 无对应 check → 收据标 `UNCAUSED_CLAIM`，State 仍不变（不另开 module）。
   - 定江需要的新鉴定（破妄已有）优先复用 `powang` / `cost`；不要为每种神功加一个 check 文件，除非公式真的不同。
   - DoD：只断言 `TurnResult`；同一 seed 重放不变。

欢迎的新 issue：

- `demo`：定江可玩层与 `_extract.md` 不一致
- `engine`：`UNCAUSED_CLAIM` 误报 / 漏报
- `authoring`：validate 诊断看不懂

仍不欢迎：社区包 PR 进 `packs/`、复刻 ST 扫描器、play 里加 `cordis_*`、把进度写进角色卡、为设定集单独做导入器。

## 以后（v1+，见 docs/engine.md §12）

- Worldsmith：从一句话想法编译出 check / lore（仍要人审；第二种编译源出现再谈 port）
- provisional 卡晋升进正式包（第二种作者出现再谈 `canon.edit`）
- ST 资产语义迁移（不保证格式兼容）
- 可选世界时钟 / `present` seam（第二种表现出现再开）

明确不做：把 ST 请回宿主、SaaS 市场、生图引擎、在故事会话里热改 Cordis。
