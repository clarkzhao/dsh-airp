# ST 世界书的时空约束（资产矿笔记）

面向 AIRP pack 作者，不是 ST 扫描器实现者。本笔记把 SillyTavern（ST）当作「对照教材 + 资产矿」：学它为什么这样设计，别学它怎么配置（见 `docs/worldbook-authoring.md` §1）。日期：2026-08-19。本机无用户社区世界书（`data/default-user/worlds` 仅有官方 `Eldoria.json`），热门包证据全部来自公开仓库的**原始 JSON / README / 官方文档原文**，未扫用户密钥。

## 结论

1. **ST 宿主没有世界钟、没有地图、没有旅行规则、没有"一天能办几件事"的行动资源**。世界书只是按关键词把条目插进提示词的「动态词典」，宿主唯一的时间概念是**聊天条数**（sticky/cooldown/delay 的计数单位），不是时辰或日期。
2. 热门世界书用**写作模式**补时空约束，不是用引擎配置。归纳为五类：A 常驻公理（constant/蓝灯）、B 地点条目（进入某地才注入距离/规矩）、C 关键词「旅行/天亮/睡觉」激活（机制支持，但抓到的热门包里没人真用它推进时间）、D setvar 记 hour/location（机制存在、热门 canon 包几乎不用，且不可信：无类型、无事务）、E 作者注/场景卡/外部工具（生态真正的落点）。
3. 模型可以无视这些句子——官方文档明说世界书「不保证」影响输出（见下 §2 引用）。所以句子要短、要进公理/常驻索引才勉强算硬约束；AIRP 里真正硬的边界是 `scene` 受 guard、`fact` 不能口头改地点（`worldbook-authoring.md:31`）。
4. **能迁到 AIRP**：一条 lore 一个概念、常驻极少、地点条目写「看得见什么/邻接哪/有什么规矩」、邻接用世界自己的词（一盏茶、城门到乱葬岗、夜不入山）、条目自成一体、把「何时该鉴定」写进 lore。**禁止学**：31 字段扫描器（scanDepth/probability/sticky/cooldown/正则二次 key）、`{{setvar::hour}}` 当世界钟、预写 `{{user}}/{{char}}` 问答对、把进度写进 lore 正文。

## ST 宿主实际做了什么

### 动态词典模型：只插入，不保证遵守

官方文档开篇定义（[World Info](https://docs.sillytavern.app/usage/worldinfo.md)，`worldinfo.md:7`）：

> "It functions like a dynamic dictionary that only inserts relevant information from World Info entries when keywords associated with the entries are present in the message text."

并明确警告（`worldinfo.md:11`）：

> "while World Info helps guide the AI toward the desired content, it does not guarantee its appearance in the generated output messages. That depends on how good your model is at making use of additional information!"

同页 Pro Tips（`worldinfo.md:16-18`）：关键词和标题不进上下文，条目必须**自成一体、宜短**；条目可以靠递归互相引用。

### 无世界钟：计时单位是「聊天条数」

官方 Timed Effects 一节（`worldinfo.md:292-326`）：

> "The time frames for the effects are measured in messages (not pairs of messages/exchanges), with 0 meaning there is no effect."（`worldinfo.md:298`）

三条规则直接否定「世界钟」的用法（`worldinfo.md:299-302`）：

> "Effects only apply in the chat where the entry was activated." / "Active timed effects are removed if the chat doesn't advance, e.g. if the last message was swiped or deleted." / "Making any changes to the entry that is currently on timed effect will cause the effect to be forcibly removed."

引擎代码坐实这一点（`public/scripts/world-info.js`，本地仓库 `/Users/clark/Workspace/SillyTavern`）：

- `WorldInfoTimedEffects` 类把效果的起止存成**消息数组的下标**：`start: this.#chat.length, end: this.#chat.length + Number(entry[type])`（`world-info.js:604-611`）。
- sticky 结束可立即接 cooldown（`world-info.js:518-529`）；delay = 聊天不足 N 条不能激活（`world-info.js:666-677`，`worldinfo.md:308-311`）。
- 引擎代码里搜不到任何「world clock / 日历 / Date」：`public/scripts` 与 `src` 无 worldclock 命中，`world-info.js` / `variables.js` / `prompt-manager.js` 无 `Date` 调用。

### 无地图、无空间模型：官方 issue 亲口承认

[Issue #4731](https://github.com/SillyTavern/SillyTavern/issues/4731)（open，[FEATURE_REQUEST] A spatial context map for lorebooks）：

> "The model has no way to understand distance, orientation, or adjacency, so spatial narration like ('walks east to the road,' 'hears the car horn from afar') has to be inputed manually. This also creates weird situations where characters step out and enter another building thats far away…"

[Discussion #3466](https://github.com/SillyTavern/SillyTavern/discussions/3466)（社区提案，直指宿主无持久时钟/地点）：

> "A major issue currently is the lack of a dynamic persistent state beyond the context length." … "The AI frequently jumps between time intervals, often inconsistent with previous times. While it's fairly accurate in calculating time passed between messages… I believe automatically generating and injecting hidden timestamps every X messages to keep track of time would be beneficial."

时间与地点的一致性要靠**作者自己维护**，宿主不给。

### 无类型变量：setvar/getvar 不可信

`public/scripts/variables.js`（本地）：

- 局部变量存 `chat_metadata.variables[name]`，全局存 `extension_settings.variables.global[name]`，普通 set 就是**原样存字符串**（`variables.js:77, 130`）；`convertValueType` 只在带 `index` + `as` 参数时才做类型转换（`variables.js:65,70,118,123`）。
- get 端自动把「像数字的字符串」强转成 Number：`return (localVariable?.trim?.() === '' || isNaN(Number(localVariable))) ? (localVariable || '') : Number(localVariable);`（`variables.js:45`）——**值本身无 schema、无类型、无校验**。
- 写后只 `saveMetadataDebounced()`（`variables.js:79`），**无事务**：失败、冲突、回滚都不存在；宏 `{{setvar}}`/`{{getvar}}` 语法见官方 [Macros](https://raw.githubusercontent.com/SillyTavern/SillyTavern-Docs/main/Usage/macros.md)（`macros.md:74, 90`）。
- 结论：`{{setvar::hour}}` 记世界钟在社区 canon 包里几乎不用，因为模型改不了它、它也不约束模型——纯装饰。

## 热门世界书的写作模式（带引用）

本机无用户世界书（只读到官方示例），以下全部引用公开一手来源：官方示例、[jeremy-green/elden-ring-lorebook](https://github.com/jeremy-green/elden-ring-lorebook)（MIT）原始 JSON、[中文教程站](https://guide.sillytavern.one/presets-lorebooks/lorebook-basics/)、ST 官方 Discussion/Issue、两个社区工具仓库。

### A. 常驻公理（constant / 蓝灯）

官方 Strategy 定义（`worldinfo.md:178`）：

> "🔵 (Blue Circle) = The entry does not need any keywords, and will trigger regardless of content."

引擎实现：constant 条目无关键词也激活、且**排最前、先吃预算**（`world-info.js:4781-4785` 激活判定；`world-info.js:2178-2181` 排序 "First constant, then normal, then disabled"；预算溢出即停止继续激活，`world-info.js:4624-4631, 4938-4955`）。

中文教程的社区叫法（[guide.sillytavern.one](https://guide.sillytavern.one/presets-lorebooks/lorebook-basics/)）：

> 蓝灯 (Constant) = 永远生效，适用「全局世界观、大总结」；「蓝灯条目永远生效，作为整个世界的'宪法'。」（guide 原文）且强调「最重要的 1-3 条用蓝灯。能用绿灯就别用蓝灯，省 token 就是省钱。」

用法共识：常驻只放不可变的「宪法」句（如「一天只有四个时辰」「没有马不能当日跨城」），且**数量必须极少**。注意：中文教程另列「黄灯 Selective」为独立策略，但当前引擎代码注释是 `//all entries are selective now`（`world-info.js:4813`）——那是旧版简化说法，别照搬。

### B. 地点条目：进入某地才注入距离/规矩

Elden Ring lorebook（1216 条，README「Optimized for Tokens with smart categorization」）把地点拆成独立条目。实证（`lorebooks/split/elden_ring_locations.json`，101 条，顶层 `scan_depth: 50`、`token_budget: 500`、`recursive_scanning: false`）：

- 每条结构固定为标签散文：`**Name**` + `Region: …` + `Boss: …` + `Rewards: …` / `Description: …`——**一条一地点一概念**。
- 101 条里显式空间邻接句只有约 3–5 条：Siofra「Connected to Nokron」、Ainsel「Leads to the Lake of Rot」、Academy Crystal Cave「connected to Raya Lucaria Academy」；另有「Region: Limgrave East」这类区域名标签。**不写距离、不写脚程、不写小时**。
- 载具条目（`elden_ring_game_systems.json` 的 Torrent）只写「mounted combat / double jump / Cannot enter all areas」，同样**没有**「骑一天走多远」。
- 全是 `constant: false`：地名（key）在对话里出现 → 才注入该地信息。这正是「进入某地才注入」的机制基础。
- 官方示例 `default/content/Eldoria.json` 也是关键词问答对（`{{user}}`/`{{char}}` 长文），4 条全 `constant: false`；「森林危险、入夜有兽」是气氛不是规则。

### C. 关键词「旅行/天亮/睡觉」激活

机制层面完全支持：key 可以是任意词，官方文档甚至给了**按行为意图匹配**的正则示例（`worldinfo.md:89-94`）：

> "An example of a use-case for advanced regex matching: An entry/instruction that should be inserted, when char is doing a weather-related action" → `/(?:{{char}}|he|she) (?:is talking about|is noticing|is checking whether|observes) (?:the )?(rainy weather|heavy wind|it is going to rain|cloudy sky)/i`

Scan Depth 决定扫最近几条消息（`worldinfo.md:332-340`）。中文教程的「绿灯」即此：关键词出现在最近 N 条消息时激活（guide 原文），并建议「关键词覆盖多种叫法（林浅雪/大师姐/雪姐）一起放」。

但**诚实结论**：本次抓到的热门包里，没有人用「天亮/睡觉/旅行」这类词做 key 去推进时间。时间推进在生态里要么交给模型（#3466 抱怨的正是它），要么落到 D/E。想用这条模式，得自己发明。

### D. setvar 记 hour/location：机制存在，不可信

见 §2「无类型变量」。社区例外证明它有多重：MagicalAstrogy 的 [MagVarUpdate](https://github.com/MagicalAstrogy/MagVarUpdate)（多角色卡时间系统，`doc/generate.md` 原文）：

> "使用了'时间段'机制，其他角色只有在时间段变更时，或者与 {user} 在同一个位置时，会进行行动。" … "也可以考虑在 {char} 的输出中增加'消耗时间'，当 <user> 的行动到达对应的时间点后，再进行行动"（附 12:00/12:15/13:00 的逐行动计时示例）。

注意它的做法是：**由模型在输出里声明「消耗 X 分钟」，再用脚本把结果写进变量**——时间账本是模型自己记的，变量只是存根。这正是 AIRP 双通道（数值走 check/gm、叙事事实走 fact）要解决的场景；setvar 方案无事务，状态可能丢、可能冲突。

### E. 作者注 / 场景卡 / 外部工具

- **场景卡/AN**：Issue #4731 作者的原话——空间邻接「has to be inputed manually」，即作者在角色 scenario/作者注里手写当前地点。当前地点常驻 AN 而非世界书，是常见做法。
- **外部工具**：[aikohanasaki/SillyTavern-MemoryBooks](https://github.com/aikohanasaki/SillyTavern-MemoryBooks) 用「Side Prompts」维护随剧情更新的状态条目（`USER_GUIDE.md:1468` 原文 "Side Prompts are background trackers that help maintain ongoing story information… update separate side-prompt lorebook entries over time"），并内置 `/sideprompt "Location Notes" {{place name}}="Black Harbor"` 这类地点追踪器（`USER_GUIDE.md:1567`）。证明生态把「持久时空状态」全推给了扩展。
- **行动资源/随机事件**：[sphiratrioth666 的 HF 帖](https://huggingface.co/sphiratrioth666/Lorebooks_as_ACTIVE_scenario_and_character_guidance_tool)（Lorebooks as ACTIVE scenario tool）用世界书做「过程化引导」：同一触发词的一组条目放进 Inclusion Group，用 group weight 掷事件结果（对应官方 Inclusion Group 语义，`worldinfo.md:194-206`）；`sticky = 4` 让指令「在接下来 N 条消息里持续生效」（原文 "sticky = 4 or more/less (it makes the instruction for LLM remain active for a given number of the following messages"）；正文用「WILL INSTANTLY」短指令句提高模型服从率。这是社区对「一天能办几件事 / 行动资源」的主流解法：**事件表 + 概率 + 短指令**，仍然不是引擎计时。

## 可迁到 AIRP / 禁止学

### 可学（写作思想）

| ST 证据 | AIRP 迁移 |
|---|---|
| 常驻极少：官方「constant 先插入、先吃预算」（worldinfo.md:369；world-info.js:4781-4785, 2178-2181）；教程「蓝灯只放 1-3 条」 | 常驻只有 `index.yaml` + 开局 `revealed` 的 axioms；axioms 一句一条、≤ 数条（`worldbook-authoring.md` §2.1） |
| 地点条目：一条一地点、标签散文、`constant:false`（ER locations 实证） | 一个地点一个 `lore/*.md`：看得见什么、有什么规矩、状态指针（`worldbook-authoring.md` §2.2） |
| 邻接用世界自己的词（Siofra "Connected to Nokron"），不写小时不写像素 | 邻接写「一盏茶」「城门到乱葬岗」「夜不入山」，不写「走 3 公里」 |
| 条目自成一体（worldinfo.md:16）；一条一概念 | 一条 lore 一个概念，正文独立完整，≤ `loreBudgetChars` |
| 概率触发随机事件（worldinfo.md:184-192）、Inclusion Group（194-206） | 随机性归 `rng` / `checks/*.yaml` 的 `formula`，lore 只写「何时该鉴定」 |
| 递归互引（worldinfo.md:397 "Entries can activate other entries by mentioning their keywords in the content text"） | 一条 lore 提到另一概念名，模型按 key 再取——写作时互相「指路」 |
| 少而准：教程「先做 5 条用半个月」「少而准，胜过多而乱」（guide 原文）；ER README「Never load more than 2-3 lorebooks simultaneously」 | 索引只列名，lore 宁缺毋滥；改场景靠换包/换 key，不靠堆条目 |

### 禁止学（扫描器配置，AIRP 刻意不复刻）

- 31 字段全家桶：`scanDepth` / `position` / `depth` / `order` / `probability` / `cooldown` / `delay` / `sticky` / `vectorized` / `caseSensitive` / `matchWholeWords` / `group` / `role`…（见 `worldbook-authoring.md` §1「不该学什么」）。
- sticky/cooldown/delay 的**消息计数计时**：AIRP 无消息计数语义，时间由叙事推进，由 `scene` guard 和 check 把关。
- 正则二次关键词 + AND_ANY/AND_ALL/NOT_ANY/NOT_ALL 组合（`world-info.js:4812-4872`）。
- `{{setvar::hour}}` / `{{getvar}}` 当世界钟或位置表：无类型、无事务、模型改不了、约束不了模型。
- 预写 `{{user}}/{{char}}` 问答对内容（ST 时代的提示词形状，语义迁移后是死对话）。
- 把进度写进 lore 正文或角色卡：数值只走 check/gm，叙事事实走 fact/correct（双通道，`worldbook-authoring.md` §1 末行）。

## 给定江切片的借鉴清单

全部来自 `_extract.md` / 现有 lore **已有句子**的压缩，不新发明、不与 `_extract.md` 冲突；可作为句子级规则写进 `lore/jzdh-dingjiang.md` 或对应新 lore（先只写笔记，未动 `lore/*.md`）：

1. **城内脚程**：当康庙、城余巷、北水街、丰水桥、宝平巷，城内一个时辰走到，不鉴定。（`_extract.md` §1；`lore/jzdh-dingjiang.md` 已有「城内一个时辰走到」）
2. **出城窗口**：乱葬岗在城外，城墙望楼可视、后山不可见；午前出、未时前回门；夜闭城门，定江不设宵禁。（`_extract.md` §1；`lore/axioms.md` 已有「午前出、未时前回门」）
3. **夜不入山**：魑魅与积年妖物夜间活动，比多数大衍武者难缠；深山寨匪夜里也不敢外出；野兽染疫是前方有瘟类妖邪的前兆。（`_extract.md` §2 幽冥；`lore/jzdh-youming.md` 已有首句）
4. **望楼只镇退路**：光天化日在望楼注视下没人敢杀人，但望楼拦不住抱着必死之心的亡命徒；不涉以武乱禁的追逐与私下争斗，望楼不管。（`_extract.md` §1 望楼段——axiom 4 只写了前半句，这半句是补充细节，宜入 lore 不入 axiom）
5. **望楼盲区=城外驿站**：驿长兵卒记不住海捕文书肖像、匀不出专人比对，册簿上报县府一来一回数日；左道妖人只要外形不特别、非刚在附近犯案，都敢住店；荒郊商队无人监管处亦可兼职盗匪。（`_extract.md` §1 望楼盲区）
6. **飞行门槛**：能飞的只有三类——大衍中期即飞者靠飞行特质（飞鼠/龙鱼）、寻常武者须虚空凝窍成翅（速度不快）、灵台境无相应特质亦飞不了；府衙不许城中用木鸢，木鸢不遇乱风、不远飞即可。（`_extract.md` §1 飞行门槛 + 市井曲三郎段）
7. **彩船飞车门槛**：机巧司机关造物、约十丈长、造价高昂；三品以上重臣可请、宗门须申请（有侍中斡旋可加速），申请须报乘员名单；配飞行武者护持。（`_extract.md` §1 彩船飞车段）
8. **时辰锚点**：丰水桥夜集三更方散；城中木石高塔三鼓后顶部窜火是全城报警，鸣金示警、击鼓关城门；幽冥异常多夜间外溢（停殡诈尸报官案）。水门/水口有叶刃机关，无金刚不坏勿水遁出城。（`_extract.md` §1 定江段）

State 建议（叙事 fact，不是数值）：`facts.watch = 日中|黄昏|入夜`、`facts.outside_gate = false`；换地点改 `scene` 仍走 guard，不做「口头瞬移」。以上条目如要落 lore，各自一条一概念拆文件，正文控制在 80–200 字（`_extract.md` §7 的惯例）。

## 依据

- 官方文档（已抓原文）：[worldinfo.md](https://docs.sillytavern.app/usage/worldinfo.md)（同页 [core-concepts/worldinfo](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)）；[macros.md](https://raw.githubusercontent.com/SillyTavern/SillyTavern-Docs/main/Usage/macros.md)
- 本地引擎代码：`/Users/clark/Workspace/SillyTavern/public/scripts/world-info.js`（timed effects 479-740、constant 4781-4785、排序 2178-2181、预算 4624-4631/4938-4955、selective 4812-4872）；`public/scripts/variables.js`（22-81、45、77、79、65/70/118/123）；`default/content/Eldoria.json`
- 社区世界书（原始 JSON/README）：[jeremy-green/elden-ring-lorebook](https://github.com/jeremy-green/elden-ring-lorebook)（`lorebooks/split/elden_ring_locations.json` 101 条、`elden_ring_game_systems.json`、README）
- 社区讨论/提案：[Discussion #3466](https://github.com/SillyTavern/SillyTavern/discussions/3466)、[Issue #4731](https://github.com/SillyTavern/SillyTavern/issues/4731)、[guide.sillytavern.one 世界书入门](https://guide.sillytavern.one/presets-lorebooks/lorebook-basics/)、[sphiratrioth666 的 HF 过程化引导帖](https://huggingface.co/sphiratrioth666/Lorebooks_as_ACTIVE_scenario_and_character_guidance_tool)、[MagVarUpdate doc/generate.md](https://raw.githubusercontent.com/MagicalAstrogy/MagVarUpdate/master/doc/generate.md)、[SillyTavern-MemoryBooks USER_GUIDE.md](https://github.com/aikohanasaki/SillyTavern-MemoryBooks/blob/main/USER_GUIDE.md)
- 本仓：`docs/worldbook-authoring.md`、`packs/jzdh-dingjiang/_extract.md` §1/§2、`packs/jzdh-dingjiang/lore/{axioms,jzdh-dingjiang,jzdh-youming}.md`、`docs/adr/0008-st-as-reference-and-asset-mine.md`

引擎层（与世界无关）：`PackMeta.places` 是可选边图。`WorldKernel.turn` 在 check/gm 写 `scene` 时读边与 `need`。没有 `places` 的包行为不变。定江只填自己的边，Kernel 不出现「定江」字样。
