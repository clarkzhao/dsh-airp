# Roadmap

不是承诺表。用来告诉社区「现在能提什么 issue、不该提什么 PR」。

**主线是引擎 + 两个 preset。** `packs/lotm-tingen` 和 `packs/jzdh-dingjiang` 是官方 demo / 测试夹具，用来证明 interface，不是产品剧情线。未来世界由生产者自己产出，放 `~/.dsh/airp-packs/` 或独立仓库。不要把「把定江读完 / 把设定集写厚」当成引擎迭代。

## 现在（v0）

- [x] `WorldKernel`：`match` / `turn`，双通道，事件溯源
- [x] Host adapter：工具翻译、开局选包、`/retry` fork
- [x] 开放包发现：bundled demo + `~/.dsh/airp-packs` + 自定义路径
- [x] 创造者：ask-user 八问 + `pack_scaffold` + `pack_validate` + 交接卡
- [x] 夹具：`lotm-tingen`、`jzdh-dingjiang`（只证明委托脊柱，不扩张成全书）
- [x] 文档：`docs/engine.md`、`docs/worldbook-authoring.md`、ADR 0008–0011

欢迎的 issue：

- `engine`：Kernel 门禁、鉴定公式、事件回放、收据是否够消费者用
- `authoring`：八问、scaffold、校验诊断、交接卡
- `docs`：消费者装包 / 生产者交包看不懂
- `demo`：夹具坏了（委托不可玩、预算爆、角色卡写了进度）——修夹具，不要借机加剧情

不欢迎的 PR：

- 把社区世界包直接塞进 `packs/`
- 把 `_extract.md` / 全书设定当运行时 Canon
- 复刻 SillyTavern 31 字段扫描器、宏、`{{setvar}}`
- 在 play preset 里加 `cordis_*` 或 bash
- 把角色进度写进 Canon 卡

## 消费者（`airp-play`）

消费者只看见：选包 → 进场 brief → `lore_get` / `state_read` / `check_propose` / `state_propose_fact` → `/retry`。看不见 validate / scaffold。

加深现有缝，不开假缝：

1. **开局卡以用户包为先，再选人、选地**
   - `~/.dsh/airp-packs` 里有包时，默认选上次玩的用户包，官方 demo 降到「示例」分组。
   - 选完包再问扮演谁、从哪进场。`opening.playable` / `index.scenes` 是候选；默认主角只是不选时的样例。
   - 粘贴路径失败要说清缺哪个文件，不要静默掉回廷根。
2. **收据给玩家看，不给作者看**
   - `TurnResult.receipt` 用包的词（对抗失败、破妄未成），不要把 `p` / `u` / 指针泄漏进叙述。
   - 第一刀因果：正文声称晋升 / 定品，但本回合无 check → 收据标 `UNCAUSED_CLAIM`，State 不变。这是 Kernel 行为，不是定江专属。
3. **`/retry` 与在场**
   - 回放到上一 check 前；委托 fact 保留。对手从 `roster` 进场、从 check 退场，不要误伤 `present` 里的盟友。

DoD：用 **scaffold 出来的新包**（不是定江）走完「接委托 → 一次对抗 → `/retry`」。夹具测试继续打 `TurnResult`，但新行为的回归夹具应是 `templates/community-pack` 的变体。

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

类 DnD 本子的爽感是：**前期时空有硬边界，后期用鉴定把边界拆掉**。这必须进 `WorldKernel`，否则每个生产者会用 lore 散文各写一套，模型一回合日行千里。

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

- `fact` 写 `scene` 若跨边且不满足 `beats` / `need` → `CHANNEL_VIOLATION`，State 不变。
- 合法换场：`turn(check: travel)` 扣 beats、改 `scene`、可选改 `present`。
- 解锁：普通 check 成功把 `mobility` +1（轻功、载具、飞车都是同一个数字）。后期 `need` 消失 = 约束被玩掉。
- 没有 `places` 的包行为与现在相同（廷根夹具零改动）。
- 生产者八问不为此加第三屏；scaffold 可写一张两节点示例图，作者删掉即无约束。

DoD：夹具用 **模板包变体**（A→B 要 4 beat、mobility=0 被拒；mobility≥1 一次 check 到达）。不要用定江地图当回归。

消费者：brief 带「现在在哪、今天还能走多远」；模型口头瞬移无事件则地点不变。

生产者：只填边的 `beats` / `need`，不必写旅行引擎。`validate` 检查边指向已有 scene lore。

## 夹具（demo，非主线）

`lotm-tingen` / `jzdh-dingjiang` 只负责：

- Kernel 回归（序列差、白名单、种子）
- Host 回归（brief 按包装配、IC 选对手、handoff）
- 文档里的「看起来像什么」

维护规则：委托脊柱坏了就修；设定集变厚不进 git 主线。`_extract.md` 与按章审计是作者工作稿，分别留在 pack 下划线文件 / 世界书目录，不进 `index.yaml`。不要为了夹具剧情给 Kernel 加神功专属 check。

## 以后（v1+，见 docs/engine.md §12）

第二种作者或第二种编译源出现再谈：

- Worldsmith（一句话 → check/lore，仍要人审）
- `canon.edit` / provisional 晋升
- ST 资产语义迁移
- `present` seam / 世界时钟

明确不做：把 ST 请回宿主、SaaS 市场、生图引擎、在故事会话里热改 Cordis、把官方 demo 写成连载主线。
