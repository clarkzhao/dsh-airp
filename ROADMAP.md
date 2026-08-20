# Roadmap

不是承诺表。用来告诉社区「现在能提什么 issue、不该提什么 PR」。

**主线是引擎 + 两个 preset。** `packs/lotm-tingen` 和 `packs/jzdh-dingjiang` 是官方示例包，用来证明引擎能玩，不是产品剧情线。未来世界由生产者自己产出，放 `~/.dsh/airp-packs/` 或独立仓库。不要把「把定江读完 / 把设定集写厚」当成引擎迭代。

## 现在：第一个基本可用版本 **0.1.0**

`package.json` 已是 `0.1.0`。Git tag `0.1.0` 在边界清完、示例包可玩、文档对得上代码时打。**0.1.0 是引擎 + 两个 preset + 两份官方示例能诚实玩一晚**，不是全书、不是 Worldsmith、不是市场。

**里面有**

- `WorldKernel`：`match` / `turn`，双通道，事件在 Host log
- Host：开局选包、常驻 `indexText`、IC 点名上场、`/retry` 回放（含换场 extra）
- 座位：轻松默认线 vs 自拟 `wanderer`（场上只有穿越者）
- Pack 数据：YAML 离场、`places.need`（`mobility>=N` 或 `facts.k=v` / `k!=v`）、`lore_get` 可读卡 body
- 创造者：八问 → scaffold → `pack_validate` → 交接卡（不热切 preset）
- 官方示例：`lotm-tingen`、`jzdh-dingjiang`（一条开场委托能走完，不是连载）
- 文档：`docs/engine.md`、`docs/worldbook-authoring.md`、[`AGENTS.md`](AGENTS.md)

**外面没有（不要为了打 tag 再做）**

- Worldsmith / `canon.edit` / play 里 mint 角色
- ST 扫描器、宏、`{{setvar}}`、Silly-Map
- **日历**世界钟（`clock.beat` 已有，不是这个）
- 因果抽查阻断（`UNCAUSED_CLAIM`）、收据对玩家隐瞒 `p`/`u`（现在 `receiptText` 仍带数字，0.1.0 接受）
- 开局卡「用户包为先 / last-played」（仍默认官方 demo 靠前）
- 官方 demo 写成全书；社区包 PR 进 `packs/`
- play 里 bash / `cordis_*`

`AGENTS.md` 在 PR #17，合入 main 后再算 0.1.0 文档齐。

欢迎的 issue：

- `engine`：Kernel 门禁、鉴定公式、事件回放、收据是否够消费者用
- `authoring`：八问、scaffold、校验诊断、交接卡
- `docs`：消费者装包 / 生产者交包看不懂
- `demo`：官方示例坏了（委托不可玩、预算爆、角色卡写了进度）——修示例，不要借机加剧情

不欢迎的 PR：

- 把社区世界包直接塞进 `packs/`
- 把 `_extract.md` / 全书设定当运行时 Canon
- 复刻 SillyTavern 31 字段扫描器、宏、`{{setvar}}`
- 在 play preset 里加 `cordis_*` 或 bash
- 把角色进度写进 Canon 卡

## 消费者（`airp-play`）

消费者只看见：选包 → 进场 brief → `lore_get` / `state_read` / `check_propose` / `state_propose_fact` → `/retry`。看不见 validate / scaffold。

**0.1.0 已有：** 选包（bundled + 用户目录 + 粘贴路径；失败不回廷根）→ 轻松线或自拟 wanderer → 常驻 brief → 上列工具 → IC 点名上场 → YAML 离场 → `/retry` 回到上一 check 前（换场 extra 保留）。

**0.1.0 之后再加深（不要挡 tag）：**

1. **开局卡以用户包为先** — last-played 默认；官方 demo 降到示例分组。
2. **收据给玩家看** — 包的词，不泄漏 `p`/`u`；声称晋升但无 check → `UNCAUSED_CLAIM`（尚未做）。


DoD：用 **scaffold 出来的新包**（不是定江）走完「接委托 → 一次对抗 → `/retry`」。引擎单测继续打 `TurnResult`；新行为的回归用 `templates/community-pack` 的变体，不要只拿定江当证明。

## 生产者（`airp-author`）

生产者只看见：两屏八问 → scaffold 到用户目录 → 改文件 → `pack_validate` → `pack_open_play` 交接卡。不能改官方 demo，不能在本会话里扮演。

加深 `Pack.validate` / `pack_scaffold`，不加第三屏、不加导入器：

1. **诊断对着作者说话**
   - 现有码补人话：开局 `revealed` 总字数、lore 死链、`check.when` 在 brief 里找不到、`_extract.md` 误进 index、委托超过一句。
   - 中文 id、往 `packs/` 写、把小说章节当 commission：继续硬拒绝。
2. **scaffold 是完整最小包**
   - 八问答案必须能生成可 `validate` 的目录：一条委托、一张卡、一条场景、一个 check、公理可空。
   - 默认写到 `~/.dsh/airp-packs/<id>/`。不要把官方 lore 当模板正文复制进去。
3. **交接是唯一出口**
   - `pack_open_play` 只出卡：新开 `airp-play` + 路径。记住 last scaffold，不要默认廷根。
   - 对抗性测试继续用独立 subagent + 真实 author 工具面，不要在主会话里扮演用户。

DoD：空会话走完八问，产出的包能被消费者开局卡选中；`pack_validate` 的 error 作者不用读源码也能改。

## 世界约束（引擎层，不是某个 demo）

类 DnD 本子的爽感是：**前期时空有硬边界，后期用鉴定把边界拆掉**。Kernel **已经有** `places` / `clock.beat` / `TRAVEL_BLOCKED` / `need`（mobility 或 `facts.k`）。下面是合同备忘，不是未开工清单。缺的是 community-pack **变体回归**（不要用定江地图当 DoD）。

ST 对照（只借语义，不借实现）：

| ST 实际做了什么 | 不是什么 | AIRP 借什么 |
|---|---|---|
| `WorldInfoTimedEffects`：sticky / cooldown / delay 按**聊天条数**计（`world-info.js` ~479–650, 4633） | 不是世界钟、不是日历、不是地图 | `State.clock.beat` = 已结算转移次数（已有 `turn` / `__check_ordinal`） |
| `{{setvar}}` 无类型、无事务（`variables.js` 240–249） | 不是位置、不是行动点 | 数值只经 check/gm。**不**借宏 |
| 世界书条目用关键词决定「现在该不该出现」 | 不是旅行规则 | 地点用 `index.scenes` + lore key，不用扫描器 |

明确不借：31 字段、sticky 条目、宏写变量、像素距离、寻路。

极简接口（仍是 `turn` / `match`，不新开 module）：

```text
State
  scene: "pack.a"
  clock: { beat, day? }          # beat 每成功转移 +1
  characters.pc.mobility: 0      # 0 步行 … 包自定义上限

Canon.pack.yaml
  places:
    pack.a: { edges: { pack.b: { beats: 4, need: "mobility>=1" } } }
```

- `fact` 写 `scene` 仍 `CHANNEL_VIOLATION`。
- check / gm 写 `scene`：无 `places` 则放行；有图则必须有边且满足 `need`，否则 `TRAVEL_BLOCKED`。Kernel 不读世界名。
- 合法换场：pack 自己的 travel check 改 `scene`，引擎按边加 `clock.beat`。
- 解锁：任意 check 把 `characters.pc.mobility` +1。轻功、载具、飞车都是同一个数字。
- 生产者八问不加第三屏；scaffold 写出空 `places`，作者填边或整段删掉。

0.1.0：内存 canon + 定江边图已覆盖 Kernel。**tag 之后：** 用 `templates/community-pack` 变体做回归（A→B 要 4 beat、mobility=0 被拒），不要把定江地图当唯一 DoD。

消费者：brief 带「现在在哪、今天还能走多远」；模型口头瞬移无事件则地点不变。

生产者：只填边的 `beats` / `need`，不必写旅行引擎。`validate` 检查边指向已有 scene lore。

## 官方示例（demo，非主线）

`lotm-tingen` / `jzdh-dingjiang` 只负责：

- Kernel 回归（序列差、白名单、种子）
- Host 回归（brief 按包装配、IC 选对手、handoff）
- 文档里的「看起来像什么」

维护规则：开场委托走不通就修；设定集变厚不进 git 主线。`_extract.md` 与按章审计是作者工作稿，分别留在 pack 下划线文件 / 世界书目录，不进 `index.yaml`。不要为了示例剧情给 Kernel 加神功专属 check。

## 以后（0.1.0 之后，见 docs/engine.md §12）

第二种作者或第二种编译源出现再谈：

- Worldsmith（一句话 → check/lore，仍要人审）
- `canon.edit` / provisional 晋升
- ST 资产语义迁移
- 日历世界钟（不是 `clock.beat`）；收据对玩家隐瞒掷骰数字；`UNCAUSED_CLAIM`

明确不做：把 ST 请回宿主、SaaS 市场、生图引擎、在故事会话里热改 Cordis、把官方 demo 写成连载主线。
