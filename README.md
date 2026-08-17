# dsh-airp

DeepSeek Harness 上的 AIRP 引擎：深 module `WorldKernel` + 浅 Host adapter。

规范：[notes/tavern-ai-native/DSH-AIRP引擎方案.md](../notes/tavern-ai-native/DSH-AIRP引擎方案.md)

## 能力

- `WorldKernel.turn` / `match`：鉴定、叙事事实、GM、检索
- `Pack.load` / `validate`：YAML 索引 + Markdown 细节
- v0 切片：`packs/lotm-tingen`（廷根，愚者 S9–S8）
- 工具名只是翻译：`lore.get` / `state.read` / `check.propose` / `state.propose_fact` / `pack.validate`

## 开发

```bash
npm install
npm test
npm run typecheck
npm run build
```

## 安装到 DSH web profile

```bash
dsh plugin --profile web add /Users/clark/Workspace/dsh-airp
# 或
npx @deepseek-ai/dsh plugin --profile web add /Users/clark/Workspace/dsh-airp
```

预设（从本仓复制，不要带 `tool-cordis`，也不要在 play preset 里挂 `play-mask`：`tools.restrict` 在挂载时全局工具表还是空的，New Session 会失败）：

```bash
cp -R presets/airp-play ~/.dsh/.agent-presets/airp-play
cp -R presets/airp-author ~/.dsh/.agent-presets/airp-author
```

新建 `airp-play` 会话时会先弹出「加载世界」卡：默认廷根切片，或自己填含 `pack.yaml` 的目录。选完后引擎把委托和工具说明注入上下文，模型不应再追问路径。

sandbox 只能写工作区。

`/retry` 由 `HostRuntime` 回放事件、把 State 裁到上一 check 之前；若 DSH 上有 `sessions.fork` 会顺带分叉会话日志。Kernel 自己不做时间旅行。

IC 文本里出现「对抗/消化/失控」等词时，Host 在 `agent/pre-step` 先 `match`，命中则先结算再让模型只叙述。
