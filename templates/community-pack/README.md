# AIRP 社区包模板

复制本目录，改 `pack.yaml` 的 `id` / `title`，再填角色、lore、checks。

```bash
cp -R templates/community-pack ~/.dsh/airp-packs/my-pack
# 或单独开 git 仓，只提交这个目录
npm run pack:validate -- ~/.dsh/airp-packs/my-pack
```

别人安装：把整个目录放到 `~/.dsh/airp-packs/<id>/`，开 `airp-play` 选它，或在开局卡底部粘贴路径。

不要把社区包 PR 进本仓 `packs/`。写法见 [`docs/worldbook-authoring.md`](../../docs/worldbook-authoring.md)。
