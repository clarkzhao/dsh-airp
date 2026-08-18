# ADR-0011：鉴定引擎是声明式 check；触发 = 谓词 AST + LLM 提案

- 状态：Accepted
- 日期：2026-08-18
- 决策者：clark（Q8 自定义, Q9-A, Q19-A, Q21-A）
- 修正：ADR-0006 的「默认 2d6≥8 / 只有 check·apply·gm 能改一切状态」——数值通道仍只有鉴定能改；叙事通道见 ADR-0010；默认骰子形状不再绑 2d6。

## 决策

1. Check 是 Canon 里的声明式数据：`id / when / condition? / kind / inputs / formula / outcomes`。
2. **触发 π**（同一 module 的 `match` + `turn`）  
   - `condition` 由 Pack.validate 收成谓词 AST；Kernel 只执行 AST，不 `eval` JS。  
   - `match(state, tags)` 命中 ⇒ Adapter 在调模型前 `turn(check)`，模型不能跳过。  
   - 未写 condition 时，仅当 `turn({type:"check"})` 且门禁通过。  
   - 走路 / 闲聊 ⇒ `events=[]`。
3. **裁决 f**  
   公式从 State 算出 `p`，再对 ξ 抽样。v0 默认：存档种子派生均匀 `u`，`u < p` 成功。测试注入 `u` 或 `none`。d20 / 2d6 须作者在 pack 声明，模型不能选。
4. 模型只看见 receipt，不能改判。
5. `turn({type:"gm"})` 必须带 reason；无 reason 拒绝。
6. `/retry` 是 Adapter 的 `sessions.fork`，不是 Kernel 的 turn。

## 后果

- 作者多一种「写 condition」的能力，但不强制；无 condition 的包仍可玩。
- 概率可解释：武力/序列差进入公式，而不是进入模型心情。

## 重新打开条件

- 装载期代码谓词被滥用时，只保留 JSON 谓词 AST，禁止再编译 JS。
