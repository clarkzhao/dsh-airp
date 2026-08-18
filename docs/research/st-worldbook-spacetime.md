# ST 世界书的时空约束（资产矿笔记）

面向 AIRP pack 作者。ST 只当对照，不复刻扫描器。日期：2026-03-26。

## 结论

SillyTavern **没有**世界钟、没有地图、没有旅行规则。热门世界书用**短散文**补「现在在哪、去下一处要多久」。模型可以无视这些句子。AIRP 能学的是句子级规矩；硬边界仍靠 `scene` 受 guard、日后 `places` 边图，不靠 `{{setvar}}`。

本机 ST `data/default-user/worlds` 只有官方 `Eldoria.json`。经你授权后，MIT 法环世界书下到仓库**外**缓存，不进 `packs/`：

`/Users/clark/Workspace/.cache/st-worldbooks/elden-ring-lorebook-main/`

（[jeremy-green/elden-ring-lorebook](https://github.com/jeremy-green/elden-ring-lorebook)，LICENSE = MIT。）官方文档镜像同目录 `worldinfo.md`。

## ST 宿主实际做了什么

官方文档开篇：World Info 是按关键词把条目插进提示词的动态词典。**不保证**模型会用这些句子。

- [World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)（[源码](https://raw.githubusercontent.com/SillyTavern/SillyTavern-Docs/main/Usage/worldinfo.md)）：「helps guide the AI… it does not guarantee its appearance in the generated output」
- 同页 Pro Tips：关键词和标题不进上下文，条目必须自成一体、宜短
- 同页 Timed Effects：评估默认无状态。sticky / cooldown / delay 按**聊天条数**计，不是时辰。改条目或 swipe 会清掉计时
- 本地 `world-info.js` `WorldInfoTimedEffects`（约 479–650、4633）：sticky 结束可接 cooldown；单位是 message index
- 本地 `variables.js` 240–249：`{{setvar}}` / `{{getvar}}` 无类型、无事务
- 官方示例 `default/content/Eldoria.json`：问答对长文。森林危险、入夜有兽，是气氛，不是「走一格扣一拍」
- 未实现的空间层：[Issue #4731](https://github.com/SillyTavern/SillyTavern/issues/4731)（open）要 LoreMap 坐标。作者现状是手写「工具棚在木屋东边几步」，模型仍会瞬移
- 社区也缺持久时钟：[Discussion #3466](https://github.com/SillyTavern/SillyTavern/discussions/3466) 建议每隔 N 条注入隐藏时间戳和地点，因为「AI frequently jumps between time intervals」

## 热门世界书的写作模式

| 模式 | 热门包怎么做 | 例子 |
|---|---|---|
| A 常驻公理 | 少用。文档写 constant 先插入、先烧预算 | Eldoria 条目 `constant: false` |
| B 地点条目 | 法环把地点拆成独立条目，用「south of / connected to」写邻接，**不写小时** | [elden-ring-lorebook](https://github.com/jeremy-green/elden-ring-lorebook) `elden_ring_locations.json`：Limgrave 含 Stormveil / Weeping Peninsula；Minor Erdtree「South of Ailing Village」；Siofra「Connected to Nokron」 |
| C 关键词激活 | 提到地名才注入。作者靠换包减 token | 法环 README：同时最多 2–3 本；探索场景才加载 locations |
| D setvar 记 hour/location | 宿主允许，热门 canon 包几乎不用 | 无类型，失败也会写 |
| E 作者注 / 场景卡 | 当前地点常写在 AN 或角色 scenario，不是世界书 | Issue 4731 作者也说要手改每条 |

本地拆包实证（`lorebooks/split/elden_ring_locations.json`：101 条，`scan_depth: 50`，`token_budget: 500`）：

- 101 条里带 east/south/connected/leads to 的只有 **5** 条
- 典型句：Siofra「Connected to Nokron」；Ainsel「Leads to the Lake of Rot」；Minor Erdtree「South of Ailing Village」
- `elden_ring_game_systems.json` 有 Torrent（可骑乘、双跳、不是所有区域能进），**没有**「骑一天走多远」

这是邻接散文 + 载具门槛，不是旅行引擎。

## 可迁到 AIRP / 禁止学

可学：

- 一条地点一条文件；正文写看得见什么、邻接哪、有什么规矩
- 邻接用世界自己的词（一盏茶、城门到乱葬岗、夜不入山），不写像素
- 常驻只留公理里最短的两三句；细节按 `lore_get`
- 条目自成一体（ST Pro Tip）

禁止学：

- sticky / cooldown / scanDepth / 正则二次 key
- `{{setvar::hour}}` 当世界钟
- 预写 `{{user}}/{{char}}` 问答对
- 把社区 JSON 世界书 PR 进 `packs/`

AIRP 已有、ST 没有的：`scene` 受 guard，`fact` 不能口头改地点。合法换场仍要 `/gm` 或日后 travel check。

## 给定江切片的借鉴清单

全部来自 `_extract.md` 已有句子，压成可玩 lore，不新发明：

1. 城内步行：当康庙、城余巷、北水街、丰水桥，一个时辰内走到。不鉴定。
2. 出城：乱葬岗在城外，望楼只看见前山。午前出门、未时前可回城门；夜闭城门。
3. 夜不入山：魑魅与积年妖物夜里活动。白日沿固定路可控；夜里就近寻处，不可强行赶路。
4. 飞：城中禁木鸢。寻常武者无飞行特质、未虚空凝窍成翅，不能飞。彩船飞车只在机巧司/兵部/顶尖势力。
5. 出府：炎京、岳江、宵州不是当日脚程。没有飞车、轻功或官方驿传，当天到不了。
6. 望楼盲区：城外驿站对海捕画像对不上。左道外形普通、非刚犯案，敢住店。
7. 丰水桥夜集三更方散。幽冥事多在夜里外溢，不等于可以连赶两座城。

State 建议（叙事 fact，不是数值）：`facts.watch=日中|黄昏|入夜`，`facts.outside_gate=false`。改 `scene` 仍走 guard。
