# ADR-0010：世界包三层（Canon / State / Session）与事件溯源的状态转移

- 状态：Accepted
- 日期：2026-08-18
- 决策者：clark（Q5-B, Q6-A, Q7-A, Q12-A, Q14-A, Q18-A, Q20-A）

## 决策

1. **Canon**（版本化，author 审阅后才进包）  
   世界书索引、细节文档、角色卡、鉴定规则、机制索引。磁盘形态：包目录，`pack.yaml` + `index.yaml` + `checks/*.yaml` + `characters/*.md` + `lore/*.md`。
2. **State**（可变 T）  
   在场、序列消化、失控、关系、时钟、已揭示事实。它是投影，不是真源。
3. **Session**（真源）  
   Kernel 产出 `StoryEvent[]`；Adapter 写入 DSH 仅追加日志。类型：`check` / `apply` / `fact` / `gm` / `correct`。fold 是 Kernel 内部缓存，不导出。回滚 = Adapter 调 `sessions.fork` 到鉴定前 seq。
4. **双通道写入**  
   - 数值 / 对抗 / 晋升 / 失控 / 资源：只能经 `turn(check|gm)`。  
   - 叙事事实：`turn(fact)` 过指针白名单即自动写；玩家用 `turn(correct)` 纠。  
   - 模型口头宣布胜负 / 晋升 / 失控无效。
5. **检索**  
   系统提示只常驻薄索引 + 当前 State 摘要；细节经 `turn({type:"lore"})` 按 key 取。
6. **角色卡**  
   出场且会被鉴定/说话的人必须有 Canon 卡。卡是人设与检索锚点；可变进度只活在 State。路人可 `provisional`，不进正式包。

## 后果

- 实现要比单文件 `state.json` 重一层 fold / 缓存。
- 与 DSH `session.fork` 对齐：重掷和存档分叉是同一原语。
- Canon 与存档不会写进同一份可变世界书。

## 重新打开条件

- fold 热路径被证明过慢，可把快照事件（`story/snapshot`）按检查点写入，仍以事件为真源。
