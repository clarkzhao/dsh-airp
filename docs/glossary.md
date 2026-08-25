# 术语表（Glossary）

> 项目：DSH AIRP 引擎（2026-08-18 起运行时宿主为 DSH；ST 仅参考 + 资产矿）
> 本文件随 ADR 与报告一起维护。8/16 的「控制面 + ST 底座」条目留作历史，现行合同以文末「AIRP 现行」为准。

## 产品与生态

- **酒馆 / SillyTavern（ST）**：本调研对象，开源角色扮演前端（Node.js + Express + 浏览器端 jQuery），支持角色卡、群聊、世界书、斜杠命令、第三方扩展等。本地调研版本：release 分支 v1.18.0。
- **酒馆生态（ST Ecosystem）**：围绕 ST 的全部可迁移资产：用户数据目录、角色卡/CharX、聊天 JSONL、预设、主题、QuickReplies、世界书、第三方客户端扩展、服务端插件、外部客户端与 HTTP API、模型连接器。
- **第三方客户端扩展（third-party extension）**：装在 `data/<user>/extensions/`（或全局 `public/scripts/extensions/third-party/`）下、带 `manifest.json` 的前端扩展；可被 ST 内置面板安装/更新/启停。
- **服务端插件（server plugin）**：装在 `plugins/` 下的 Node 插件，由 `enableServerPlugins: true` 开启；初始化时得到一个 Express Router，挂载到 `/api/plugins/<id>`。
- **角色卡（Character Card）**：PNG `tEXt` 内嵌 `chara`（CCv2）或 `ccv3`（CCv3）元数据；**CharX** 为 ZIP 容器（`card.json` + 资产）。
- **聊天记录**：按角色目录存储的 JSONL 文件，首行为 `chat_metadata`，其后每条消息为一条 JSON。
- **世界书（World Info / Lorebook）**：键值/触发词式世界设定库。
- **斜杠命令（Slash Commands）**：ST 前端脚本注册的 `/命令`；本地 v1.18.0 约 297 处注册。
- **QuickReplies / 宏（Macros / STScript）**：快捷回复、宏定义与宏引擎。
- **兼容矩阵（Compatibility Matrix）**：本项目用于验收“兼容全部生态”的分类清单与测试方法，见 `compatibility-matrix.md`。

## DeepSeek Harness（DSH）

- **DSH**：DeepSeek Harness，本地调研版本 `0.1.0-rc.6`；Cordis 插件化 agent harness，提供 web/headless 等 profile。
- **创造模式（Creative Mode）**：官方 `cordis` 组合（UI 名“创造模式”），在 Standard 全能力之上加入 `cordis_*` 运行时自修改工具与创作技能。
- **cordis_* 工具集**：`cordis_inspect / define / run / stop / undefine` 五个工具，可查看/定义/运行/停止/删除当前 DSH 进程内的动态包（host half 与 browser half）。定义只存在于进程内存、会话内可见、不落盘、重启即失；沙箱不是安全边界，等价于 shell 权限。
- **anchored-creative（创造·锚定）**：用户已预装的自定义预设。首请求精确复现 Minimal/RL 条件（system 仅一句 persona，工具仅 `bash + str_replace_editor`，无 AGENTS/skill 注入），首个工具调用后晋升为小型 resident 目录，按需通过 `dev_tool_search` 解锁 `cordis_*` 等工具。
- **首请求锚定（Anchoring）**：让每个会话第 1 次模型请求精确复现 RL 训练接口条件，以稳定模型策略轨迹（详见 `~/Workspace/notes/deepseek-strongest-mode-mac.md`）。
- **Web profile**：`dsh --profile web [--host H] [--port P] [--trusted-host A]`，提供浏览器 UI 与 `/api` RPC；`--host 0.0.0.0` 被 CLI 有意拒绝。
- **信任围栏（trust fence）**：DSH `/api` 只接受 loopback 或 `--trusted-host` 声明的 authority。
- **Typert**：DSH 的 RPC 协议；Host 通过 Gateway 暴露 `namespace/method` 端点，客户端经 Connection（HTTP 上行 / WebSocket 下行）调用。
- **Headless profile**：`dsh --profile headless "task"`。一次性直接驱动一个 agent，无 HTTP/浏览器，完成后把最后一条非空 assistant 文本写到 stdout 并以退出码报告成败。
- **Session（事件溯源日志）**：DSH 会话的 append-only JSONL 事件流（`user/message`、`assistant/message`、`tool/result`、`request/header`、`turn/start|end` 等），模型消息历史由它派生。
- **Goal / Goal Round**：DSH 目标机制；活跃目标会由 goal-round-driver 生成连续 `<goal_round>` 回合，直至完成/暂停/达到 `maxGoalRounds`。

## 本项目架构

- **控制面（Control Plane）**：DSH agent 负责安装、配置、诊断、迁移、自愈、自升级、生成扩展的“管家”层；不进入角色扮演聊天热路径。
- **兼容底座（Compatibility Base）**：原装 SillyTavern release 运行时，保证数据、功能、第三方扩展、API 兼容。
- **降门槛壳（Onboarding Shell）**：确定性安装器 + ST 内“管家面板”客户端扩展 + 自然语言配置。
- **管家面板（Butler Panel）**：装在 ST 里的仪表盘式面板：状态、任务、审计、一键操作、回滚、快捷指令、扩展工坊入口；agent 自由对话仍在 DSH web。
- **渐进式演进（Progressive Escalation）**：先纯外围插件 → 触发条件成立时最小 fork → 最后才是内核重写 + 兼容层。
- **三硬指标（DoD）**：零基础 ≤10 分钟能聊；老用户 data 原样迁移且扩展/记录可用；管家关键任务成功率 ≥90% 且改动可审计可回滚；兼容矩阵冒烟全绿。
- **ADR**：Architecture Decision Record，架构决策记录。

## 路线 B 专有

- **路线 B / B 轨道**：抛弃 ST 生态，在 DSH/Cordis 插件生态上重建互动叙事内核的并行 R&D 轨道（ADR-0005）。
- **StoryPack**：DSH 原生的故事内容包 = npm 包（`dsh.bundle.patch`）+ 语义资产（world/characters/scenes/rules/seeds 的 YAML）+ `skills/story/SKILL.md`。
- **story-core / story-view / story-import**：路线 B 的核心插件——状态与存档服务、DSH web 内故事视图、agent 语义迁移工具链。
- **设计原则 D1**：不追求格式兼容；按最适合 DeepSeek Harness 的方式定义故事资产；ST 资产迁移由 agent 语义级转写完成。
- **转正条件**：路线 B 取代路线 A 主投入的数据门槛（留存、社区包数、迁移率、官方稳定性、自增长信号，满足任意 3 项评审）。
- **Worldsmith**：路线 B 的创作流水线 agent——从一句话想法/旧资产出发，经提纲、语义抽取、schema 编译、试玩平衡、diff 审阅，产出 StoryPack。
- **判定驱动的叙事状态机（CNSM）**：世界状态 = schema 约束 JSON；判定 = 声明式 check（when/kind/dice/dc/outcomes）；只有 check/apply/gm_override 工具能改状态；掷骰与 patch 全程可审计。
- **机制分层 L1/L2/L3**：L1 纯叙事 flag；L2 默认判定模式（2d6≥8，成功/代价/失败 + 进度钟）；L3 硬核（1d20/对抗/伤害/资源）。
- **Provisional 内容**：运行时为玩家进入的未写区域临时生成的世界书/判定条目；双库存储，需作者晋升审阅才能成为正式生态内容。
- **DSH LUI**：DeepSeek Harness Web 的会话式界面（对话流 + 工具卡 + 命令面 + 审批/提问卡）；本项目的用户级创作载体。
- **In-Session Authoring（边玩边创作）**：消费即创作、会话即编辑器、纠错即版本提交的用户级范式（ADR-0007）。
- **双平面模型**：故事平面（IC，角色内对话，永不触发创作）与导演平面（OOC，`/` 命令或显式导演模式，创作只发生在这里）。
- **六个创作动作**：`capture`（记住设定）/ `correct`（纠正事实）/ `define`（定义判定规则）/ `expand`（扩展未写区域）/ `seed`（分叉成开局种子）/ `publish`（发布 StoryPack）。
- **差异卡（Diff Card）**：agent 创作提案的 before/after 工具卡；接受/拒绝/分叉试玩，审批走 DSH approval seam 并写入事件日志。
- **apply-forward / retroactive**：创作修改默认只影响此后叙事；回改历史必须 fork 预览后执行。
- **TTC（time-to-correct）**：从玩家产生“不满意”到世界修改生效的耗时，目标 ≤30 秒。

## AIRP 现行（2026-08-18）

- **AIRP**：AI Roleplay 引擎。深 module `WorldKernel` + 浅 `DshHostAdapter` + 两个产品 Preset。
- **WorldKernel**：`match(state, tags)` 与 `turn(intent) → {state, receipt, events}`。领域不变量只活在这里。
- **DshHostAdapter**：把 DSH 工具/斜杠译成 intent，把 `StoryEvent` 写入 session；`/retry` = `sessions.fork`。
- **dsh-airp**：承载 Kernel + Adapter 的 Host 插件仓。
- **airp-play / airp-author**：可见性掩码 + persona。官方「创造模式」只用于开发插件。
- **Canon / State / Session**：Canon 版本化；State 是投影；Kernel 的 `StoryEvent[]` 是 T→T+1 真源。
- **鉴定 / Check**：声明式规则。`match` 命中则强制 `turn(check)`，否则模型提案 + 门禁。
- **condition**：Canon 谓词 AST，不是 `turn` 上的 JS。
- **ξ / RNG**：鉴定随机源。v0 默认公式出 `p` 再均匀抽样；骰子只是一种 ξ，模型不能选。
- **双通道**：数值字段只能经 check / gm；叙事事实经 fact / correct。
- **薄索引**：`index.yaml` 常驻；细节经 `turn(lore)` 按 key 取。
- **lotm-tingen**：v0 切片包（廷根，愚者 S9–S8，一条委托）。
- **provisional 卡**：未写入正式包的临时路人卡。
- **资产矿**：ST 角色卡/世界书只作语义迁移原料，不作运行时格式。
- **airpStage / 舞台**：Host 可选呈现 seam。`publish`/`mountRoot` 把本地图挂到 `/airp-media`，返回同源绝对 http(s) URL 给叙述者嵌进对白。不进 Kernel，不加 play 工具，不绑某一家生图。
