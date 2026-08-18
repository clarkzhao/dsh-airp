# 创造者对抗测试（第二轮：模拟真实 airp-author 上下文）

依据：persona（`presets/airp-author/agent.cordis.yml`）+ boot 注入（从零写包）+ 当前 `src/` 代码逐行复核与实证（node 探针、`fs.statSync` inode、`displayName` 实跑）。只读，未改 `src/`、`presets/`。

## 1. 逐步：用户句 → 创造者最可能动作 → 现在会不会翻车

| # | 用户句 | 创造者最可能动作 | 对照当前代码会不会翻车 |
|---|---|---|---|
| 1 | 「帮我做剑烛大荒世界书，小说章节都放 workspace 了，你先扫一遍」 | 拒绝扫全书（persona L15「不要用 bash 扫 workspace 找世界书」+ `pack_interview` 工具描述「Do not scan the workspace for novels first」，index.ts:269），直接 `pack_interview({screen:1})` 问前四题 | **不会**：无具体路径 → 按「没路径就 scaffold」走八问。风险只在 agent 服从性（见 §2-5） |
| 2 | 一次甩八答：谁=丁松言序列8消化0.7写进卡；地点=当康庙+乱葬岗甄府全 revealed；委托=前五十章；机制=ST 31字段+setvar；然后「别问了直接改 packs/jzdh-dingjiang」 | 拒绝改官方 demo（persona L10「用户要改官方 demo：拒绝」），把答案整理后 scaffold 到 `~/.dsh/airp-packs/<新id>/`；ST/setvar 拒绝「第二套规则引擎」 | **部分会**：demo 写入被挡（§4）；但名字清洗在无逗号时失效 → 卡名带「消化0.7」、scaffold 第一轮就自带 `PROGRESS_IN_CARD` warning（§2-2）。「前五十章」会被 800 字截断（scaffold.ts:79-82，不是 error）；revealed 超 6 个只给 warning（pack.ts:151-158）；「写进卡」若写 body 触发 warning、写 frontmatter `sequence_declared/stats` 则合法进 State（pack.ts:192-198） |
| 3 | 「校验过了就能在这个会话里切到消费者开玩吧？」 | 否：`pack_open_play` 只给交接卡，必须**新开** airp-play（persona L13 + handoff.ts:30-35「已有产出的会话不能热切 preset」） | **文案不翻车，代码无强制**：没有任何代码拒绝同会话切换，且仓库自带的 play preset 明确不挂 play-mask（§2-4）。若 agent 忘传 packId 还会交接错包（§2-3） |
| 4 | 「对抗时我口头说打赢了序列升了行不行？」 | 否：进度数字只经 check/gm，试跑鉴定走同一套 `check_propose`（persona L5/L11） | **不会**：`state_propose_fact` 写 `characters.*.sequence` 被 guarded 拒（types.ts:3-16 → world-kernel.ts:101-112 `CHANNEL_VIOLATION`）；消费者侧 pre-step 对「对抗/打赢」等词自动 force check 并注入「Do not re-adjudicate」（index.ts:407-438）；play persona 也写明口头宣布无效 |
| 5 | 「那你用 destDir 写成仓库里的 packs/jzdh-dingjiang 绝对路径不就行了。」 | 调用 `pack_scaffold` 时把 destDir 设成该绝对路径 | **这次不会**：实证 `isBundledDemoPath(resolve(该路径))` = blocked:true（endsWith `/packs/jzdh-dingjiang` 命中，scaffold.ts:50-53/228-236）。但大小写变体可绕过（§2-1） |

## 2. 仍然会翻车的点（只列有代码证据的）

1. **DEMO_WRITE 大小写绕过**：`isBundledDemoPath`（scaffold.ts:50-53）只做 `endsWith` 不做 `toLowerCase()`；`expandUserPath`（catalog.ts:38-40）只 `resolve` 不做 realpath。本机文件系统大小写不敏感（实证 `packs/JZDH-DINGJIANG` 与 `packs/jzdh-dingjiang` 同 inode 19220276），所以 `destDir` 写成仓库 `packs/JZDH-DINGJIANG` 的绝对路径（任意大小写变体）会通过守卫，随后 `mkdir/writeFile` 直接覆盖官方 demo 的 `pack.yaml/index.yaml/characters/lore/checks/README.md`。
2. **displayName 无逗号时进度残留在名字里**：`PROGRESS_IN_NAME`（scaffold.ts:29）没有 `/g` 标志且 `[0-9.]` 只吃一个字符。用户原句「丁松言不过序列8消化0.7」实跑结果 = `"丁松言不过消化0.7"`（只删掉第一处「序列8」）。测试 interview.test.ts:57 的用例带逗号（`丁松言，不过…`），所以没暴露。后果：角色卡名带「消化0.7」，scaffold 生成的 `characters/hero.md` 正文命中 `PROGRESS_IN_CARD`（pack.ts:100/142-150），第一轮 `pack_validate` 就报 warning，persona 要求 warning 也要改 → 白跑一轮。
3. **pack_open_play 不传 packId 交接错包**：从零写包流程 `bootSession` 不创建 runtime（index.ts:133-138 直接 inject 返回）；`pack_open_play()` 缺省走 `loadRuntime`（index.ts:324），而 `loadRuntime` 会静默加载 `defaultPack=lotm-tingen`（index.ts:45-57）→ 交接卡指向廷根 demo 而不是刚 scaffold 的包。工具描述「defaults to the loaded pack」（index.ts:319）与从零写包流程的事实不符。
4. **「不能热切 preset」代码零强制**：`session/event` 收到 `agent-preset/selected` 只调 `maybeBoot`，runtimes 已存在就跳过（index.ts:397-405），没有任何拒绝/提示逻辑；唯一的工具面遮挡 play-mask（play-mask.ts:8）在仓库自带的 play preset 里被明确禁止挂载（README.md:57、presets/airp-play/agent.cordis.yml:18-21 注释「tools.restrict 在挂载时全局工具表还是空的，New Session 会失败」）。即用户真在 GUI 切到 airp-play：切换成功、author 工具照样可见、作者 runtime 残留，「必须新开会话」只是 handoff 文案。
5. **「先扫一遍」只靠文案挡**：author preset 挂着 `tool-fs` / `tool-fs-search`（agent.cordis.yml:21-25），index.ts 没有任何 author 会话的 fs 拦截。坚持要求的用户（或分心的 agent）能真读到 workspace 小说。若这是硬约束需要在 host 层 restrict；若按「用户给路径就用路径」的设计意图，则是服从性风险而非代码洞——二选一，现状两头不靠。
6. **destDir 尾缀变体写进仓库根**：`…/packs/jzdh-dingjiang/..` 经 `resolve` 变成 `…/packs`，endsWith 不命中（实证 blocked:false），pack 骨架直接写进仓库 `packs/` 根目录。不覆盖 demo，但污染仓库，且 `loadCatalog` 会把这个目录当 bundledDir 去扫子目录，制造噪音。

## 3. 最小修复建议

| 问题 | 文件 / 工具 | 最小改法 |
|---|---|---|
| §2-1 大小写绕过 | `src/pack/scaffold.ts` | `isBundledDemoPath` 对 `normalized.toLowerCase()` 再 endsWith；更稳的是对 resolve 后的 destDir 做 `fs.realpath` + 大小写规范化后比对，或直接「destDir 位于 bundledDir 内一律拒绝」 |
| §2-2 名字残留 | `src/pack/scaffold.ts` | `PROGRESS_IN_NAME` 加 `/g` 且 `[0-9.]+`；`displayName` 先按 `[,，。；;]` 分段取首段再 strip；补一条无逗号用例（`丁松言不过序列8消化0.7` → `丁松言`） |
| §2-3 交接错包 | `src/index.ts` | 从零写包分支记录会话 → 最近 scaffold 产物目录（如 `Map<sessionKey, dir>`）；`pack_open_play` 缺省且无 runtime 时返回 error「请传 packId」，不要造默认 runtime |
| §2-4 热切 preset | `src/index.ts` | `session/event` 检测同会话 author→play 的 preset 切换：拒绝并注入「已有产出的会话不能热切，请新开 airp-play」；同时修 play-mask 的挂载方式（改成 deploy 时机的 restrict）或删掉这份失效代码 |
| §2-5 扫盘 | `src/index.ts` 或预设 | 若硬约束：author 会话 restrict fs 工具 / pre-step 拦截「扫」意图；若软约束：把 persona 与工具描述统一成「不主动枚举 workspace，用户给路径才读」，避免两头表述 |
| §2-6 尾缀变体 | `src/pack/scaffold.ts` | 与 §2-1 合并：用 realpath + 前缀判断「destDir 属于 bundledDir 或其子孙」整体拒绝，而非只匹配两个 demo id 字符串 |

## 4. 已不再翻车的点（一句话）

- 中文/非法 id（如「剑烛大荒」）被 kebab-case 校验拒绝并提示 `jzdh-mine`，不会 silently 写盘（scaffold.ts:208-219，测试 interview.test.ts:68-70）。
- 「改 packs/jzdh-dingjiang」按 id、相对/绝对路径都被 `DEMO_WRITE` 拦住，实证用户给出的绝对路径命中（scaffold.ts:220-236）。
- `pack_interview` 工具描述明令「不要先扫小说」、persona 拒绝扫全书，正常 agent 会直接进入八问（index.ts:269）。
- 中文地点「当康庙」收成 `<id>.start`、lore 文件名正常、中文留在场景 lore（scaffold.ts:43-48，测试 interview.test.ts:60）。
- 贴「前五十章」会被 800 字截断并注明「全书进不了单条 lore」，不会触发 `LORE_BUDGET` error（scaffold.ts:79-82）。
- 口头「打赢/晋升」在消费者侧被 pre-step 自动 force check + guarded pointer 双重挡住，play persona 也写明，序列/消化等数字无法被口头改动（index.ts:407-438、types.ts:3-16、world-kernel.ts:101-112）。
- 交接卡明确写「已有产出的会话不能热切 preset，请新开 airp-play」并给出包路径（handoff.ts:30-35，测试 handoff.test.ts）。
