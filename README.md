# dsh-airp

DeepSeek Harness 上的 AIRP 引擎：深 module `WorldKernel` + 浅 Host adapter。

- GitHub：https://github.com/clarkzhao/dsh-airp
- topic：`dsh-plugin`
- 规范：[docs/engine.md](docs/engine.md) · agent 入口：[AGENTS.md](AGENTS.md) · 术语：[docs/glossary.md](docs/glossary.md) · 写包：[docs/worldbook-authoring.md](docs/worldbook-authoring.md) · 规划：[ROADMAP.md](ROADMAP.md)

一句话：LLM 只提案和叙述；规则把 State 从 T 写成 T+1。

## 能力

- `WorldKernel.turn` / `match`：鉴定、叙事事实、GM、检索
- `Pack.load` / `validate` / `catalog`：YAML 索引 + Markdown 细节；bundled + `~/.dsh/airp-packs` + 自定义路径
- 官方示例（不是产品主线）：`packs/lotm-tingen`、`packs/jzdh-dingjiang`。自己的包写到 `~/.dsh/airp-packs/`
- 工具名必须匹配 `^[a-zA-Z0-9_-]+$`：`lore_get` / `state_read` / `check_propose` / `state_propose_fact` / `check_match` / `pack_validate` / `pack_scaffold` / `pack_open_play` / `pack_interview`
- 可选舞台 `airpStage`：`/airp-media` 把本地图变成同源绝对 http(s) URL，叙述者嵌进对白。不出图引擎，不绑 grok-image。

## 世界包生态

世界包是**数据**，不是插件代码。引擎只认目录里有没有合法的 `pack.yaml`。

```text
packs/lotm-tingen/          # 官方 demo，进 git
packs/jzdh-dingjiang/       # 官方 demo，进 git
packs/<your-id>/            # 本地实验；默认被 .gitignore
~/.dsh/airp-packs/<id>/     # 推荐的用户/社区安装位置
任意/含 pack.yaml 的目录     # 开局卡底部粘贴路径
```

消费者（`airp-play`）开局选包；创造者（`airp-author`）用 `pack_interview` 取 8 问 → `ask_user_question` → `pack_scaffold` → 改文件 → `pack_validate` → `pack_open_play`。`pack_open_play` **不会**热切本会话：已有产出不能换 preset，交接卡只告诉你新开一条 `airp-play` 并粘贴路径。

分享一个包：复制 `templates/community-pack/`，或把目录打成 zip / 开独立 git 仓。别人解压到 `~/.dsh/airp-packs/<id>/` 即可。本地校验：

```bash
npm run pack:validate -- ~/.dsh/airp-packs/my-pack
```

不要把社区包 PR 进本仓 `packs/`，除非它要成为下一个官方 demo。Issue 用仓库模板（`pack` / `authoring` / `engine`），说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

```bash
npm install
npm test
npm run typecheck
npm run build
```

## 安装到 DSH web profile

装一次进 **web profile**。之后每次 `dsh web`（即 `dsh --profile web`）都会按该 profile 的 `dsh.profile.bundles` 加载 Host 插件，不必每次 `plugin add`。

```bash
dsh plugin --profile web add /path/to/dsh-airp
# 出图（可选，不绑本仓）：同一 profile 再装 grok 聊天 + 生图
dsh plugin --profile web add /path/to/dsh-llm-grok
dsh plugin --profile web add /path/to/dsh-grok-image
# 或
npx @deepseek-ai/dsh plugin --profile web add /path/to/dsh-airp
```

装完核对 `~/.dsh/profiles/web/package.json`：

- `dependencies` 里有 `dsh-airp`（本地开发用 `link:`）
- `dsh.profile.bundles` 里有 `dsh-airp`；要出图再并列 `dsh-llm-grok`、`dsh-grok-image`

每次启动：

```bash
dsh web
# 或指定端口
dsh web --port 3080
```

| 层 | 谁 | 何时加载 |
|---|---|---|
| AIRP 引擎 + `airpStage`（`/airp-media`） | `dsh-airp` | web profile 启动即挂 |
| Grok 聊天 | `dsh-llm-grok` | 装进同一 profile 后启动即挂 |
| `image_gen` | `dsh-grok-image` | 装进同一 profile 后启动即挂；不要求 AIRP |
| 玩世界 / 写包 | 会话选 `airp-play` / `airp-author` | **不会**随 `dsh web` 自动选 |

Host 改动（含 `/airp-media`）要**重启** `dsh web`。HMR 不可靠。

预设（从本仓复制，不要带 `tool-cordis`，也不要在 play preset 里挂 `play-mask`：`tools.restrict` 在挂载时全局工具表还是空的，New Session 会失败）：

```bash
cp -R presets/airp-play ~/.dsh/.agent-presets/airp-play
cp -R presets/airp-author ~/.dsh/.agent-presets/airp-author
```

`~/.dsh/settings.yaml` 的 `agent-presets.default` 建议保持 `standard`。新会话默认编码；要进世界再选 **AIRP 消费者**。不要把默认改成 `airp-play`，否则每次开 DSH 都弹入场卡。

- **AIRP 消费者**（`airp-play`）会弹「加载世界」卡：新建或空白会话切到该 preset 都会问一次。
- **AIRP 创造者**（`airp-author`）会弹「编辑世界」卡，并可「从零写一个新世界包」。
- 卡片底部可粘贴含 `pack.yaml` 的目录；选自定义后不会再静默掉回廷根。
- 出图：`image_gen` 来自 grok-image，不是 AIRP 工具。play 只在同时有出图工具和 brief 舞台 URL 时把同源绝对 http(s) 嵌进叙述。

sandbox 只能写工作区。用户包推荐写到 `~/.dsh/airp-packs/`（host 插件写盘，不经过 agent sandbox）。

`/retry` 由 `HostRuntime` 回放事件、把 State 裁到上一 check 之前；若 DSH 上有 `sessions.fork` 会顺带分叉会话日志。Kernel 自己不做时间旅行。

IC 文本按**当前包**的 `pack.yaml` `tags` 词表打标；命中则 Host 在 `agent/pre-step` 先 `match`，再让模型只叙述。
