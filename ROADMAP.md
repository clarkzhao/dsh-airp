# Roadmap

不是承诺表。用来告诉社区「现在能提什么 issue、不该提什么 PR」。

## 现在（v0）

- [x] `WorldKernel`：`match` / `turn`，双通道，事件溯源
- [x] Host adapter：工具翻译、开局选包、`/retry` fork
- [x] 官方 demo：`lotm-tingen`、`jzdh-dingjiang`
- [x] 开放包发现：bundled + `~/.dsh/airp-packs` + 自定义路径
- [x] 创造者：ask-user 八问 + `pack_scaffold` + `pack_validate`
- [x] 文档：`docs/engine.md`、`docs/worldbook-authoring.md`、ADR 0008–0011

欢迎的 issue：

- `engine`：Kernel 门禁、鉴定公式、事件回放
- `pack`：demo 设定错误、条目超预算、委托不可玩
- `authoring`：八问不够用、scaffold 缺字段、校验诊断难懂
- `docs`：社区看不懂怎么装自己的包

不欢迎的 PR：

- 把社区世界包直接塞进 `packs/`（请独立仓库 / zip）
- 复刻 SillyTavern 31 字段扫描器、宏、`{{setvar}}`
- 在 play preset 里加 `cordis_*` 或 bash
- 把角色进度写进 Canon 卡

## 下一步（v0.2）

- 包清单卡显示 title / license / 作者，而不是只有目录名
- `pack_validate` 检查 lore 预算、一条一概念、角色卡误写进度
- 创造者写完后一键「用这个包开一局消费者会话」
- 社区包模板仓（只含 `pack.yaml` 骨架 + CI 调 `pack_validate`）

## 以后（v1+，见 docs/engine.md §12）

- Worldsmith：从一句话想法编译出 check / lore（仍要人审）
- provisional 卡晋升进正式包
- 因果抽查阻断（正文声称晋升但无事件）
- ST 资产语义迁移（不保证格式兼容）

明确不做：把 ST 请回宿主、SaaS 市场、生图引擎、在故事会话里热改 Cordis。
