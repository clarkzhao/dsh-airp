---
name: worldbook-authoring
description: 写 AIRP 世界包。八问、scaffold、一条 lore 一个概念、角色卡不写进度。
---

# 写世界包

流程（不要跳）：

1. `pack_interview({screen:1})` → `ask_user_question` 原样问
2. `pack_interview({screen:2})` → 再问一屏
3. 两屏 answers 交给 `pack_scaffold`，写到 `~/.dsh/airp-packs/<id>/`
4. 改 YAML/Markdown，每轮 `pack_validate`
5. 通过后 `pack_open_play`。用户必须**新开** `airp-play`，本会话不能热切 preset

不要改 `packs/lotm-tingen` 或 `packs/jzdh-dingjiang` 当用户作品。

## 铁律

- 一条 lore 一个概念；`index.scenes` 的 `foo.bar` 要有 `lore/foo-bar.md`（或父级 `foo.md`）
- 角色卡只写口吻 / 外形 / 对外身份 / 底牌。进度数字只活在 State
- axioms 短；revealed 只放公理 + 场景 + 委托
- 数值只经 check / gm。试跑用同一套 `check_propose`
- 细节见仓库 `docs/worldbook-authoring.md`
