# ST 核心 vs AIRP 缺口

- 日期：2026-08-19
- 立场：ADR-0008——ST 只是对照代码 + 资产矿，运行时宿主是 DSH。本文只鉴定 **WorldKernel / Pack / DshHostAdapter / 两个 preset** 层的能力差，不讨论「把定江读完」或社区 pack。
- 一手来源：本机 `/Users/clark/Workspace/SillyTavern`（`git log` HEAD `8172dcd0e`）、本机 `/Users/clark/Workspace/dsh-airp`、官方文档 [docs.sillytavern.app](https://docs.sillytavern.app/)。
- 上一份对照笔记（世界书时空）：[st-worldbook-spacetime.md](./st-worldbook-spacetime.md)，本文只引用其已核实的 file:line 锚点，不重复展开。

## 结论（最缺，按杠杆排序）

判定标准：**删掉这项，玩家或作者会立刻感到世界不诚实，或创作成本明显高于写 lore**。UI 糖、采样旋钮、多 API 后端不算。

1. **按 State 的持续注入缺失：场景/委托/在场/facts 只进一次 boot brief，换场与长会话后不再回显。**
   依据：AIRP 里 bootBrief 只在开场注入一次（`src/index.ts:188-192` 的 `agent.inject`）；之后每回合常驻的只有 `indexText()`——一个「名字清单」：pack id、checks/characters/lore 的**名字**、pc、邻接行，**不含**场景正文、委托正文、facts（`src/host/runtime.ts:60-70`，经 `src/index.ts:445-457` 的 `systemPrompt.context('airp:index')` 每轮注入）。travel（check/gm 写 `scene`）后新场景 lore 不会自动注入，模型得记得自己 `lore_get`。对照 ST：Author's Note 是一个**每 N 条用户消息按固定 position/depth/role 重注入**的持续槽（`public/scripts/authors-note.js:30-36` 存 `chat_metadata.note_prompt`，`:346-362` interval 默认 1 ⇒ 每轮都注入，`:383-391` `setExtensionPrompt` 固定位置），且可边玩边改（`/note`，`:501-515`）。命中判据：换城后模型按旧城规矩叙述、长会话 compact 后委托漂移——玩家立刻感到世界不诚实。这是「ST 有、AIRP 缺」里最直接的一条。

2. **在场只有进场没有退场：`present` 单向增长，离场角色变成「幽灵在场」，match 谓词继续对它们成立。**
   依据：全仓唯一改 `present` 的运行时路径是 `stageActors`，只 push 不 remove（`src/host/runtime.ts:226-233`，经 `forceIc` `:193-208` 调用）；`retry` 只回放事件不调在场（`:210-224`）。而 `match()` 的 `present` 谓词对**任何**仍在 `state.present` 里的角色成立（`src/kernel/world-kernel.ts:177-182`），`resolveActors` 还会自动把唯一在场者填进谓词槽（`:153-160`）——于是「已经离场的对手」仍可能被 `condition` 强制再判一场。`present` 不在 `DEFAULT_GUARDED`（`src/kernel/types.ts:3-19` 只有 `scene` 没有 `present`），`state_propose_fact` 理论上可以裸写 `present` 数组，但那是绕过语义、无收据、无审计的旁路。ROADMAP 已自列此缺口：「对手从 roster 进场、从 check 退场，不要误伤 present 里的盟友」（`ROADMAP.md:44-45`）——计划中、未落地。注意：**ST 群聊也没有进/退场协议**（成员静态，增删是用户操作 `public/scripts/group-chats.js:1418-1421`；它有的是「谁回话」的发言权调度 `:1242-1299`，那是前端生成问题）。所以这条不是抄 ST，是 AIRP 自己的在场语义缺口，且直接命中「玩家立刻感到不诚实」。

3. **叙述与事件的因果抽查未落地（第一刀 `UNCAUSED_CLAIM`）。**
   依据：ROADMAP 已列为 v0 收尾项——「正文声称晋升/定品，但本回合无 check → 收据标 `UNCAUSED_CLAIM`，State 不变。这是 Kernel 行为」（`ROADMAP.md:42-43`）；当前 `WorldKernel` 只产出事件与收据，模型叙述与事件的一致性无人校验（`src/kernel/world-kernel.ts:38-54` 的 `turn` 不接触叙述文本；engine.md §5 末行「v0 只打警告，不阻断、不改 State」`docs/engine.md:249`）。ST 完全没有此能力（ST 无 State 可查），所以这条是**从「诚实状态转移」主线推出的自身缺口**，不是 ST 对照项——但它命中的判据最硬：模型口头改判是 engine.md §11 对抗审查表的第一行攻击面（`docs/engine.md:342-344`）。

> 诚实说明：候选里其余项（bookmarks、memory 摘要、角色卡多字段、regex/QR、prompt manager、tool calling、PNG 导入、群聊发言权）经代码核实后**均不达标**，归入下方类别 2/4，理由见对照表。

## 对照表

分类互斥：**① AIRP 已有且更深　② ST 有、AIRP 故意不做　③ AIRP 最缺、值得加深现有缝　④ 看起来缺、其实是 DSH 宿主已提供**。

| ST 组件 | 它实际做什么（file:line） | AIRP 对应 | 缺不缺 | 为什么 |
|---|---|---|---|---|
| `world-info.js` 世界书扫描器（31 字段、sticky/cooldown/delay、constant、regex 二次 key） | 关键词扫描最近 N 条消息，把激活条目按预算插进提示词；timed effects 按**消息条数**计（`world-info.js:604-611, 4781-4785, 4812-4872`；锚点见 st-worldbook-spacetime.md） | `lore_get` 按 key 拉取 + `loreBudgetChars` 预算（`world-kernel.ts:56-62`）；`places` 边图 guard 换场（`:129-143`） | ② | 扫描器是「插入不保证遵守」的提示词技巧，无 State、无事务。AIRP 用按 key 拉取 + 硬 guard 替代。刻意不复刻（engine.md:356、ROADMAP:27） |
| `macros.js` 宏引擎（`{{roll}}`/`{{setvar}}`/`{{summary}}` 等） | 请求前把文本宏替换成变量/骰子/日期（`macros.js` 全文件；`variables.js:45,77,130` 无类型无事务存 chat_metadata） | 数值只经 check/gm，formula 是 pack 声明式表达式（`world-kernel.ts:209-338`） | ② | 宏是「把数字写进文本」的装饰，`{{setvar}}` 无 schema 无事务。AIRP 双通道（engine.md §5）更深。pack 校验甚至对宏语法打 `MACRO_SPEAK` 警告（`pack.ts:105,157-165`） |
| `variables.js` chat 变量 / `chat_metadata` | 每聊天一个 JSON 袋，扩展与 slash 共用；get 端把「像数字的字符串」强转 Number（`variables.js:45`） | `State.facts` + `StoryEvent` 事件溯源（`types.ts:143-152, 207-221`；`world-kernel.ts:104-117`） | ① | AIRP 事实有类型、有 guard 白名单、可重放；ST 变量无类型、无事务、模型改不了也约束不了模型 |
| 角色卡多字段（personality/scenario/first_mes/mes_example/system_prompt） | 卡拆成若干提示词槽，各自有注入位置（`PromptManager.js` `INJECTION_POSITION` :37、PromptCollection :201） | 卡 = frontmatter（name/keys/pathway/sequence_declared/stats/provisional）+ body（`pack.ts:69-83`）；开场由 bootBrief + commission/scene lore 承担（`runtime.ts:72-101`） | ② | 字段拆分是**前端提示词位置工程**；AIRP 的卡 body 已含口吻/外形/对外身份，可变进度分离进 State（双通道）。`mes_example` 这类文本是资产矿（story-import 转写），不是内核缺口 |
| `group-chats.js` 群聊 | 固定成员 + 发言权调度：mention 检测、talkativeness 骰子、防同一角色连说（`group-chats.js:1242-1299`）；增删成员是用户操作（:1418-1421） | `present`/`roster`（`types.ts:76-84, 146-149`；`pack.ts:230-251`）；进场在 `forceIc` 顺带（`runtime.ts:226-233`） | ③（一半） | ST 的「谁回话」是前端生成调度（AIRP 单一叙述者不需要）；AIRP 真正缺的是**退场**——见结论 2 |
| `authors-note.js` Author's Note / 场景卡 | 每 N 条用户消息按固定 position/depth/role 重注入 `note_prompt`（`authors-note.js:30-36, 346-362, 383-391`）；可边玩边改（/note :501-515） | 只进一次 bootBrief（`index.ts:188-192`）；常驻只有 indexText 名字清单（`runtime.ts:60-70`） | **③（最缺 1）** | 见结论 1 |
| `script.js` / `chats.js` 聊天历史（swipe、regenerate、deleteLastMessage、编辑） | 改写/重掷叙述消息（`script.js:9894, 1605, 4231`；slash `/regenerate` `slash-commands.js:1530-1531`） | DSH session 仅追加（engine.md:22）；叙述改写不影响 State，唯一撤销是 `/retry` fork（`runtime.ts:210-224`） | ②/④ | 叙述改写是前端糖，状态以事件为准；DSH session 本身只追加。不做（engine.md:22「仅追加 session」） |
| `bookmarks.js` 检查点 | 把当前聊天复制成新聊天文件「Checkpoint #N」，可命名、可跳回（`bookmarks.js:46-110`） | `/retry` 按 checkId 回放到指定 check 前，重放事件重建 State（`runtime.ts:210-224`；`index.ts:422-426` `sessions.fork`） | ④ | AIRP 的 fork 是**事件重放**（State 真正回到 T），ST 书签只是复制消息历史（无 State 可回）。`/retry <checkId>` 已支持任意 check，粒度差≈0 |
| `PromptManager.js` / `instruct-mode.js` / `sysprompt.js` 提示词组装 | 把角色卡/世界书/AN/聊天历史按顺序和 token 预算组装成一次请求；instruct 模板负责 user/assistant 分隔（`instruct-mode.js:387,466`；`sysprompt.js:156`） | DSH persona + `systemPrompt.context`（`index.ts:445-457`）；preset 挂 `@deepseek-ai/dsh-persona`（`~/.dsh/.agent-presets/airp-play/agent.cordis.yml`） | ④ | 提示词组装/分隔符/上下文顺序是**宿主与模型路由**的职责，AIRP 插件不拥有；DSH 已提供 persona 与 systemPrompt 注入 |
| `personas.js` persona | 用户角色管理、描述注入（`personas.js:623` setPersonaDescription 等） | DSH persona（preset 层，同上） | ④ | DSH 宿主已提供 persona；AIRP 的 PC 是**世界角色**（present[0] 的卡），玩家身份走 persona |
| `tool-calling.js` 工具注册/调用 | 注册表机制：扩展注册 function tool，转 OpenAI 函数 JSON 并发起调用（`tool-calling.js:240-303, 400-418, 770-884`）；结果存消息 extra（:884-917） | `check_propose`/`state_propose_fact`/`lore_get`/`state_read`/`check_match` 直通 `turn`/`match`（`index.ts:253-301`；`translate.ts:26-49`） | ① | ST 的工具是**机制层**，世界状态本身不走工具（走 slash/宏/变量）；AIRP 的世界状态**就是**工具面，且带 guard。更深 |
| `extensions/memory` 摘要记忆（内置扩展） | 定期用模型把聊天压成摘要，存消息 extra，按 `[Summary: {{summary}}]` 模板回注（`extensions/memory/index.js:105-106, 959-968`） | DSH session 日志即长期记忆；compact 续接不重 boot（`boot.ts:62` `source === 'compact'` 视为 resume） | ④ | 摘要回注是**宿主上下文管理**（DSH compact）与内置扩展的职责；AIRP 的事实持久活在 State + `state_read`，比摘要可靠（摘要无 schema，可能丢事实）。不算缺口 |
| `extensions/regex` / `quick-reply` / `expressions` / `gallery` / `attachments` / `caption` | 正则改写文本、宏化操作、表情/图库/生图（均在 `public/scripts/extensions/`） | 无对应 | ② | **内置扩展，不是核心鉴定层**（用户指定立场）。生图/表情/图库明确不做（engine.md:296） |
| `power-user.js` 快捷设置 | tokenizer UI、自定义 CSS、auto-save 等用户偏好（`power-user.js` 全文件） | 无对应 | ② | UI 糖/采样旋钮不算缺口（判据明说排除） |
| `src/endpoints/*` 服务端持久化 | characters/chats/worlds 的 JSON/JSONL 落盘与 API（`src/endpoints/characters.js` 等） | DSH session 持久化 + 事件日志 | ④ | 持久化是宿主职责（engine.md:22 仅追加 session） |
| `slash-commands.js` 命令面 | 数百个命令：/regenerate /continue /impersonate /world /note /get /set 等（`slash-commands.js:344,880,1397,1489,1530`；`authors-note.js:501-515`） | /look /state /retry /gm /correct /ooc（`index.ts:411-443`；`translate.ts:51-74`） | ①/② | AIRP 的命令是导演通道且全部经 `turn` 门禁；ST 的 /get /set /impersonate /world 等是前端命令面（无状态可写），刻意不做 |
| 角色卡首白（first_mes） | 角色开场消息 | bootBrief + commission/scene lore（`runtime.ts:72-101`） | ① | AIRP 是 pack 级开场（委托+场景+在场），比 per-character 首白更整；example 对话是资产矿 |
| 多 API / Horde / 生图后端 | 模型路由与外部服务 | DSH model route | ④/② | 模型路由是 DSH 宿主职责；生图明确不做 |

## 明确不做（立场重申，全部有出处）

- **31 字段世界书扫描器**、sticky/cooldown/delay 的消息计数计时、regex 二次 key、递归激活——刻意不复刻（engine.md:356；ROADMAP.md:27；st-worldbook-spacetime.md §禁止学）。
- **`{{setvar}}` / `{{getvar}}` / 宏引擎**——无类型无事务，模型改不了也约束不了模型（st-worldbook-spacetime.md §2「无类型变量」）。
- **ST 进程内扩展 / 安装器 / 兼容矩阵**——ADR-0008 决策 3-4。
- **SaaS 市场、生图引擎、世界书全书进运行时、PNG 卡当运行时**——engine.md §12、ROADMAP 末行。
- **群聊发言权当世界规则**（「AI 帮谁说话」是前端生成调度，不是状态）——engine.md:356。
- **改 Canon 热替换**（ST 边玩边改世界书/AN 立即生效）——AIRP 里 Canon 是版本化文件，play 无写口；改规则 = author 会话改文件 → 新 play 会话（engine.md:98「会话一旦有产出不能热换 preset」；DoD #6 engine.md:294）。这是**诚实性设计**（热改破坏 T→T+1 可验证性），不是缺口。
- **PNG/CharX 导入器**——资产矿语义转写是 `story-import` 的事（ADR-0008 决策 3），不是内核。

## 建议加深的现有缝（不新开 port）

一条 adapter 不够开新 port（codebase-design：一个 adapter 只是假设缝）。以下全部落在现有 Module / Interface 上：

1. **brief seam 加深（对应最缺 1）**：`HostRuntime` 已有 `bootBrief()`（`runtime.ts:72-101`）但只发一次。加深为可重发/自动重发：a) travel（check/gm 写 `scene`）成功时，Adapter 自动把新场景 lore 注入本回合（等价于对 `index.scenes` 的新 key 做一次 `turn({type:'lore'})`，仍走 `loreBudgetChars` 预算，不扫关键词）；b) 换场或每 N 回合重发一行「scene / present / facts / clock.beat」回显（`travelLine` 已有雏形 `runtime.ts:103-115`）。这是对现有 `brief`/`turn` 的加深，不引入扫描器语义。
2. **turn/match 的在场语义加深（对应最缺 2）**：`present` 进入 guard 通道（只允许 check 结算或 gm 改 present，`fact` 写 `present` 应 `CHANNEL_VIOLATION`——现在 `DEFAULT_GUARDED` 有 `scene` 无 `present`，`types.ts:3-19`）；check 的 outcomes 支持 `apply` 写 `present` 数组做离场；离场时产出事件（可审计）。`match` 的 `present` 谓词语义不变，但离场后角色自然不再命中。`Pack.validate` 补一条：`present`/`roster` 引用的角色必须有卡（部分已有 `OPENING_ABSENT`，`pack.ts:118-120`）。
3. **kernel 因果抽查落地（对应最缺 3）**：`turn` 之后把叙述文本与 `events` 对照（声称晋升/定品但本回合无 check 事件），收据层标 `UNCAUSED_CLAIM`、State 不变（ROADMAP.md:42-43 已写死是 Kernel 行为）。这是 engine.md §5 双通道的收尾，也是对「模型口头改判」攻击面（engine.md:342-344）的第一道真实阻断。

## 依据

- 本地 ST：`/Users/clark/Workspace/SillyTavern`（HEAD `8172dcd0e`）——`public/scripts/{authors-note.js,group-chats.js,bookmarks.js,tool-calling.js,variables.js,slash-commands.js,instruct-mode.js,sysprompt.js,personas.js,PromptManager.js}`、`public/script.js`、`public/scripts/extensions/memory/index.js`。
- 本地 AIRP：`/Users/clark/Workspace/dsh-airp`——`src/{kernel,pack,host}/*`、`docs/engine.md`、`ROADMAP.md`、`docs/adr/0008-st-as-reference-and-asset-mine.md`、`docs/research/st-worldbook-spacetime.md`（其 file:line 锚点为本文件复用）。
- preset：`~/.dsh/.agent-presets/airp-play/agent.cordis.yml`（挂 `@deepseek-ai/dsh-persona`）。
- 官方文档：Author's Note 概念见 [docs.sillytavern.app](https://docs.sillytavern.app/)（World Info / Macros 各页；世界书侧引用见 st-worldbook-spacetime.md 依据节）。
- 范围声明：未改 `src/`，未 commit，未扫任何用户密钥/社区包（本机无用户世界书，见 st-worldbook-spacetime.md 开头）。
