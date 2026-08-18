# AIRP 世界包写作指南（Worldbook Authoring）

面向作者，短而硬。把 SillyTavern 世界书当成「对照教材」：学它为什么这么设计，别学它怎么配置。AIRP 没有关键词扫描器、没有 31 个字段、没有宏。你写的是**语义资产**，不是提示词工程。

核心对应关系（本指南一切规则由此推出）：

| AIRP | 对应 ST 机制 |
|---|---|
| `index.yaml` 常驻薄索引 | constant（蓝色常驻条目） |
| `lore/*.md` 按 key 取 | 关键词激活条目（绿色） |
| 角色卡（Canon）≠ 可变 State | 人设卡 ≠ `{{setvar}}` 变量 |
| 一条 lore 一个概念 + 字数预算 | 短条目 + token budget |
| 无扫描器 | 31 字段扫描器（刻意不复刻） |

---

## 1. ST 世界书「该学什么 / 不该学什么」对照表

| ST 机制（代码依据） | 该学什么 → AIRP 对应 | 不该学什么 / 为什么 |
|---|---|---|
| **关键词激活**：主 key + 次 key（`keysecondary`）+ 逻辑（`selectiveLogic`：AND_ANY / AND_ALL / NOT_ANY / NOT_ALL）（world-info.js:4812-4872） | **按需注入**：不提就不占上下文。AIRP 里索引条目名就是「触发词」，模型读常驻索引后按 key 调 `lore_get` | 正则关键词、二次关键词、AND/NOT 逻辑组合、`matchWholeWords`、`caseSensitive`、`scanDepth`。AIRP 没有扫描缓冲区，不需要这些旋钮 |
| **Budget**：默认 25% 上下文，溢出后停止继续激活任何条目（world-info.js:4624-4631, 4942-4954） | **预算意识**：每条 lore 有硬预算（`loreBudgetChars`，默认 4000 字），超了直接 `BUDGET` 拒绝（world-kernel.ts:58-59）。写作时把「这条值不值 4000 字」当默认问题 | 全局百分比、`ignoreBudget` 逃生舱。AIRP 是**单条**预算，不是全局池 |
| **Constant**（蓝灯）：无关键词也激活，排序最前、先于一切关键词条目插入并吃掉预算（world-info.js:4781-4785, 2178-2181） | **常驻必须极少**：AIRP 的常驻物只有 `index.yaml`（经 `systemPrompt.context` 注入，DSH-AIRP 方案 §3）。常驻 = 每回合全付 token | 把剧情、细节、长设定设 constant。ST 里 constant 先插入、先烧预算，一条肥 constant 能饿死所有关键词条目 |
| **Recursive**：条目内容可再触发其他条目（`world_info_recursive`，world-info.js:4960-5024） | **概念相连**的思想：一条 lore 提到另一个概念名，模型可再取一条。写作时让条目互相「指路」 | `excludeRecursion` / `preventRecursion` / `delayUntilRecursion` 层级配置。AIRP 由模型主动按 key 取，没有扫描循环，不需要递归开关 |
| **条目内容形态**：ST 示例条目是 `{{user}}/{{char}}` 问答对长文（调研报告 §1.1） | **条目独立完整**：官方 Pro Tip——标题和关键词不进上下文，条目必须自成一体。AIRP lore 正文就是纯设定散文 | 预写触发问答对、`{{roll}}`、`{{setvar}}` 宏。AIRP 里骰子归 check，变量归 State，都不进 lore 文本 |
| **31 字段整体**（key/keysecondary/position/depth/order/scanDepth/probability/cooldown/delay/sticky/vectorized/group/role…，调研报告 §1.1） | 只写：**文件名（=key）+ 正文**，字符卡加少量 frontmatter | 复刻扫描器。ADR-0008 决策 2：ST 世界书只用来说明「不要复刻什么」 |
| **常量/变量分离的失败**：ST 用正则宏写变量，无类型无校验无事务（调研报告 §1.2） | **双通道**：数值只经 check/gm，叙事事实经 fact/correct，Canon 文本作者改文件（DSH-AIRP 方案 §5） | 把进度写进人设卡或 lore 正文（见 §4 反模式） |

社区共识（可参考，不覆盖上面代码结论）：条目建议 200–500 字、过长拆条；能用关键词激活就别用常驻；关键词备好同义词、别带标点；少而准，胜过多而乱。

---

## 2. AIRP pack 条目写法规范

包结构（`packs/<id>/`，参考 `packs/lotm-tingen/`）：

```
pack.yaml                 # id / title / locale / rng（默认 bernoulli；骰子由包声明，模型不能选）
index.yaml                # 常驻薄索引：entry_scene / opening / checks / characters / lore / scenes
checks/*.yaml             # 声明式鉴定规则
characters/*.md           # 角色卡 = Canon 人设
lore/*.md                 # 设定条目，一个文件一个概念
```

### 2.1 axioms（公理，`lore/axioms.md`）

- 放**不可变的世界规则**，开局 `revealed`（`opening.revealed: [axioms, ...]`）。
- 写得像公理：一句一条、短、无叙事、无比喻。参考 lotm-tingen 只有 4 条。
- **这是最贵的 lore**（开局就常驻），能用 5 条绝不用 50 条。放不进 axioms 的，拆成普通 lore 按需取。

### 2.2 地点（一个文件一个地点）

- 讲三件事：**看得见什么**（场景）、**有什么规矩**（该地规则/气氛）、**状态指针**（`facts.*`，供 check 引用）。
- 文件名 = 触发词，起名要和索引、正文一一对应（`tingen.md` ↔ `scenes: tingen.blackthorn`）。
- 地点被 `present` 激活时，模型自己会取；不需要写「当玩家进入时」的触发条件——那是扫描器思维。
- 开场在场只写此刻能说话的人。对抗对象放 `opening.roster`：进 State，但不站在开场。IC 点到名字才会拉上场。
- `opening.playable` + `index.scenes` 是消费者开局卡的候选。默认 `present` / `entry_scene` 只是不选时的样例，不要把包绑死在一个主角身上。

### 2.3 机制（如 `fool-s9-s8.md`）

- 讲「这是什么、边界是什么、**何时触发鉴定**」。鉴定规则本体放 `checks/*.yaml`，lore 只做解释层。
- 机制 lore 与 check 的关系：lore 告诉模型和玩家「世界怎么运作」，check 告诉引擎「什么情况必须结算」。两者别互相复述。
- 不要在 lore 里写公式、概率、判定细节——那是 `checks/*.yaml` 的领地。

### 2.4 人物（角色卡 Canon）

frontmatter 只放身份声明，正文只放不可变人设：

```markdown
---
id: klein
name: 克莱恩·莫雷蒂
keys: [克莱恩, 愚者, Klein]     # 索引/触发的别名
pathway: fool
sequence_declared: 9            # 对外声明的身份，不是当前真实进度
---
正文：口吻、外形、对外身份、说话习惯。底牌（不能在对白里主动泄露的东西）单独一句。
```

- **卡里不写进度**：序列、消化、失控、资源都是 State 的数值字段，只经 check/gm 改变。
- 出场会说话或被鉴定的人必须有卡；临时路人标 `provisional`，不写回包。
- `keys` 是模型识别「谁在场」的依据，覆盖多种叫法（全名/绰号/称号）。

### 2.5 开局委托（如 `commission.md`）

- 给模型一条**可执行的线**：委托是什么、建议节奏（步骤 → fact 写入点 → 鉴定触发点）。
- 参考 lotm-tingen 写法：目标一句讲清 + 5 步节奏，每步标注该写哪个 fact、哪一步才鉴定。
- 委托是 lore，不是常驻：开局 `revealed` 里放它，但正文保持短，让它可被 `/retry`、`correct` 反复校准。

### 2.6 预算与命名铁律

- 每条 lore ≤ `loreBudgetChars`（默认 4000 字）。超了引擎直接 `BUDGET` 拒绝，不会悄悄截断。`pack_validate` 在装载期也会报 `LORE_BUDGET`（error）；角色卡写进度、缺委托、revealed 过多是 warning，包仍能加载。
- `index.yaml` 常驻，按 token 算比 lore 贵一个量级：只列名字和清单，不写描述。
- 一条 lore 一个概念：触发一次只注入一件事。两个概念就拆两个文件。

---

## 3. ask-user 引导问题清单（≤ 8 题）

原则：**每个问题必须能落成一个 State 变更或 opening 选择**；不改变 State 的问题别问；引擎状态里已有的（present 有谁、revealed 有哪些）别问。超过 8 题就砍。

| # | 问题 | 落到哪 |
|---|---|---|
| 1 | 你想扮演谁？ | `opening.present` / 角色选择 |
| 2 | 你的角色此刻的对外身份/称呼？ | `facts.*`（不是角色卡！） |
| 3 | 从哪个地点/场景开始？ | `entry_scene` / `scenes` 选择 |
| 4 | 你的委托或目标是什么？ | `facts.commission` / 委托选择 |
| 5 | 要读一遍公理和索引，还是直接开玩？ | `opening.revealed` 扩充（教学 vs 直入） |
| 6 | 机制档位？（纯叙事 / 默认判定 / 硬核） | 决定打开哪些 check |
| 7 | 语气与叙事密度？（严肃 / 轻松 / 快节奏） | `facts.tone` 类指针 |
| 8 | 有没有绝对不能出现的主题？ | `facts.banned` 类指针 |

每个问题一句话能答。创造者不要自己编题：`pack_interview({screen:1})` 和 `pack_interview({screen:2})` 各问一屏，`ask_user_question` 原样用返回的 `questions`。两屏答案一起交给 `pack_scaffold`（写入 `opening.facts` / `revealed` / `rng`）。`index.scenes` 里的 `foo.bar` 要有 `lore/foo-bar.md`。**不要写回角色卡**。`pack_validate` 通过后调 `pack_open_play`：用户必须**新开** `airp-play`。

---

## 4. 反模式（写包时别犯）

| 反模式 | 后果 | 正确做法 |
|---|---|---|
| **把全书贴进一条 lore** | 单 key 预算直接 `BUDGET` 拒绝；即使没超，「一条 lore 拉全书」也是方案 §11 点名的攻击面，每回合白烧 token | 拆成多 key，一条一概念；索引只留指针 |
| **constant / index.yaml 塞剧情** | 常驻 = 每回合全付 token；ST 里 constant 先插入先烧预算，肥常驻饿死所有按需条目 | 索引只列名；细节进 lore 按需取；axioms 开局 revealed 后也不该长 |
| **角色卡写进度数字**（序列 9→8、消化 0.2、`facts.last_contest` 写进卡） | Canon 被污染成「作者钦定」，与 State 打架，T→T+1 失去诚实性；`fact` 碰数值字段整单拒绝（`CHANNEL_VIOLATION`） | 卡只写口吻/外形/对外身份；进度只活在 State，只经 check/gm |
| **复刻 31 字段扫描器**（scanDepth、probability、cooldown、sticky、正则二次关键词…） | 回到提示词工程；AIRP 没有扫描器，这些配置全部无效且误导 | 只写文件名 + 正文 + 少量 frontmatter |
| **条目写成 `{{user}}/{{char}}` 问答对** | ST 时代的「提示词形状」内容，语义迁移后是一堆死对话 | 写独立完整的设定散文；标题/关键词不进上下文，条目必须自成一体 |
| **机制写死骰子**（d20、2d6 写进 lore 文本） | 骰子只是随机源 ξ，由包声明（`rng`），模型不能选；写进文本就成了装饰 | 公式/概率只放 `checks/*.yaml` 的 `formula` |
| **一条 lore 多个概念** | 触发一次全塞进来，预算爆炸，且模型抓不住重点 | 一条一概念，拆文件 |
| **开局 revealed 塞太多** | 相当于开局就把半本书设成 constant | revealed 只放 axioms + 当前场景 + 委托 |
| **依赖宏/装饰符表达状态**（`{{roll}}`、`{{setvar}}`、`@@activate`） | AIRP 无宏；状态只经工具变更，口头宣布不改世界（叙述称晋升但无事件 → 只警告，State 不变） | 表达状态走 check / fact / correct |
| **关键词带标点或单一叫法** | 触发失败/漏触发 | 别名进 `keys`，纯文本，多叫法 |

---

## 依据

- 本地代码：`SillyTavern/public/scripts/world-info.js`（budget:4624-4631,4942-4954；constant:4781-4785,2178-2181；selective:4812-4872；recursive:4960-5024）
- 本仓方案：`docs/engine.md`（§3 三层数据、§5 鉴定双通道、§11 对抗审查）；`src/kernel/world-kernel.ts`、`src/pack/pack.ts`、`packs/lotm-tingen/` 与 `packs/jzdh-dingjiang/`（设定集：`packs/jzdh-dingjiang/_extract.md`）
- ADR：`docs/adr/0008-st-as-reference-and-asset-mine.md`（ST 只当对照代码与资产矿）
- 社区参考：[SillyTavern 官方 World Info 文档](https://docs.sillytavern.app/usage/worldinfo.md)（Pro Tips：条目自成一体、保持精简）、[世界书入门（中文教程站）](https://guide.sillytavern.one/presets-lorebooks/lorebook-basics/)（200–500 字/绿灯优先/少而准）
