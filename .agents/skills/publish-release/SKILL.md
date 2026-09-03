---
name: publish-release
description: >-
  Publish a GitHub Release for this repo with gh: read version from package.json,
  ensure the matching git tag exists on origin, distill notes from commits since
  the previous version tag, then create the release. Use when the user asks to
  发布 release、发版、打 tag、GitHub Release、gh release, or mentions draft / --draft /
  草稿. Do not use GitHub MCP.
---

# 发布 GitHub Release

只使用 `gh` + `git`。不要用 GitHub MCP。不要打印 `GH_TOKEN` / PAT。回复用中文。

## Draft vs 正式发布

读用户这轮原话：

- 含 `draft`、`--draft`、`草稿` → `gh release create` 加 `--draft`
- 否则直接发布（不加 `--draft`）

## 流程

### 1. 版本号

```bash
node -p "require('./package.json').version"
```

记为 `VERSION`，标签为 `v${VERSION}`（例如 `0.1.7` → `v0.1.7`）。

`package.json` 的 version 必须已在当前 HEAD。工作区若还有未提交的 version 改动，先停下来告诉用户。

### 2. 认证与 `gh`

```bash
command -v gh || brew install gh
# 不打印 token
[ -n "$GH_TOKEN" ] || true
gh auth status
```

未登录且环境没有 `GH_TOKEN` 时停止，让用户先 `export GH_TOKEN` 或 `gh auth login`。不要去读 `~/.zshrc` 里的密钥。

仓库：当前目录即可，不必传 `--repo`。

### 3. 云端 tag

```bash
git fetch origin --tags
git ls-remote --tags origin "refs/tags/v${VERSION}"
```

云端**没有** `v${VERSION}` 时：

```bash
# 本地也没有才打 tag（打在当前 HEAD）
git rev-parse -q --verify "refs/tags/v${VERSION}" || git tag "v${VERSION}"
git push origin "v${VERSION}"
```

云端已有该 tag：不要重打、不要 `--force`。继续做 release。

### 4. 提交记录 → 文案

上一版 tag（排除当前）：

```bash
git tag -l 'v*' --sort=-v:refname | grep -v "^v${VERSION}$" | head -1
```

没有上一版时，用 `git log --pretty=format:'%s' --no-merges`；有则：

```bash
git log "${PREV}..HEAD" --pretty=format:'%s%n%b' --no-merges
```

精炼成用户能看懂的更新说明，不要当 changelog 堆砌。

**丢掉：**

- 纯 docs / 截图 / README
- 仅版本号 chore（`chore: v0.1.x`）
- 测试、重构、类型，除非用户能感知到行为变化

**保留：** 兼容性、默认行为、设置项、识图能力等产品变化。多条提交合成少数要点，用「为什么」而不是文件名。

### 5. 文案格式（必须对齐既有 release）

标题（用中文破折号 `—`）：

```
v{VERSION} — {一句中文摘要}
```

正文：先一段话说明宿主/产品发生了什么、本版怎么处理；再 2～5 条 `-` 列表。可含行内 `` `code` ``。不要写「版本 bump」「加了测试」。

正文末尾必须加页脚（与正文空一行、再 `---`、再空一行）。固定英文，不要改写、不要翻译：

```
---

<sub><em>Automatically published by the <code>publish-release</code> skill.</em></sub>
```

GitHub 会把 `<sub>` 渲染成小号灰色、`<em>` 成斜体。新建和 `gh release edit` 都要带上。

示例（照这个语气和结构，不要照抄内容）：

标题：`v0.1.7 — 兼容 Harness 0.1.2-alpha.1 凭据接口与附件路径`

```
DeepSeek Harness 0.1.2-alpha.1 把浏览器凭据从 `connection.api` 挪到 `remote.credentials`，附件路径方法也改成 `imageHostPath()`。本版两边都认，旧宿主继续可用。

- 识图卡优先走 `remote.credentials`，没有时回退 `connection.api.credentials`；0.1.2 宿主不再挂 `api` 也不会报错
- 凭据服务晚挂载时自动刷新「已配置密钥」状态
- 附件路径优先 `imageHostPath()`，没有或抛错再回退 `imagePath()` / 本地 `root` 布局

---

<sub><em>Automatically published by the <code>publish-release</code> skill.</em></sub>
```

再对照：`v0.1.6 — 兼容 Harness 0.1.1 凭据事件，默认改用 DeepSeek 识图`、`v0.1.5 — 兼容 DeepSeek Harness rc.7 设置页 slot`。可用 `gh release view v0.1.6 --json name,body` 核对风格。

### 6. 已有 release

```bash
gh release view "v${VERSION}" --json isDraft,url
```

- 已正式发布 → 停止，给出 URL，不要覆盖
- 已是草稿且本轮也要草稿 → `gh release edit "v${VERSION}" --title "..." --notes "..."` 更新文案
- 已是草稿且本轮要正式发布 → 先 `edit` 文案，再 `gh release edit "v${VERSION}" --draft=false`

### 7. 创建

notes 用 HEREDOC，避免 shell 转义：

```bash
gh release create "v${VERSION}" \
  --title "v${VERSION} — {摘要}" \
  --notes "$(cat <<'EOF'
{正文}

---

<sub><em>Automatically published by the <code>publish-release</code> skill.</em></sub>
EOF
)"
```

草稿再加 `--draft`。成功后把 URL 发给用户。草稿的 URL 可能是 `untagged-…`，属正常。

## 禁止

- GitHub MCP（`list_releases` / `get_latest_release` 等）
- `git push --force`、改已有 tag
- 把 token 写进回复或命令回显
- 未确认云端 tag 就 `gh release create`
