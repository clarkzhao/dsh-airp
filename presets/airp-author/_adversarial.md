# 创造者对抗测试（模拟真实 airp-author 上下文）

子代理会话：`c64c329a-1861-4101-8aaa-95e3c379c415`（用户台词 + persona + boot 注入 + 仅创造者工具面）。下列翻车点在代码里复核过，并已修。

| 用户行为 | 修之前 | 修之后 |
|---|---|---|
| 「先扫 workspace 小说」 | persona 只口头禁止 bash，工具描述没挡 | `pack_interview` 说明：不要先扫小说 |
| 中文 id「剑烛大荒」 | `slugify` 变成 `new-pack`， silently 写盘 | kebab-case 校验失败，提示用 `jzdh-mine` |
| 「改 packs/jzdh-dingjiang」 | scaffold 不拒官方 demo | `DEMO_WRITE` |
| 名字里夹「序列 8 消化 0.7」 | 整句进卡 | `displayName` 截断进度 |
| 中文地点「当康庙」 | 当 scene id，lore 文件名变成乱码/空 | 收成 `<pack>.start`，中文留在场景 lore |
| 贴长委托/全书 | 整段进 `commission.md`，可能 `LORE_BUDGET` | 超 800 字截断并注明 |
| 「这个会话切消费者」 | 交接卡已写不能热切 | 文案保留；persona 再强调 |

源材料笔记已从根 `docs/_extract-jzdh.md` 挪到 `packs/jzdh-dingjiang/_extract.md`（`_` 前缀不进 lore）。
