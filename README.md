# dsh-image-pathify

让 **deepseek-v4-flash** 这类「不能看图」的模型，也能处理你贴进聊天里的图片，并直接调用插件内置的识图工具。

聊天记录和界面里的缩略图**不会变**。插件只在把消息发给模型前，把图片换成一行本地文件路径；模型再调用 `analyze_image` 读这个文件，通过你配置的视觉 API 得到文字描述。

```
你贴一张图  →  聊天里照常显示缩略图
           ↓
发给不能看图的模型前  →  变成：Saved attachments: /某路径/某文件
           ↓
模型调用 analyze_image  →  视觉 API 返回文字描述
```

已经能看图的模型不受影响，图片会原样发给它们。`read_image` 在不能看图的模型上会被拒绝，并提示改用 `analyze_image`。

磁盘上的图片文件是 **dsh 自己保存的附件**（`~/.dsh/attachments/v1/...`），不是本插件另存的一份。

## 安装

把 `<name>` 换成你的 profile 名（Web 界面一般是 `web`）：

```sh
dsh plugin --profile <name> add dsh-image-pathify
dsh --profile <name> --dump-config   # 能看到 dsh-image-pathify 就装好了
dsh web                              # 打开 Web 界面后生效
```

打开 **设置 → 插件 → 识图**，填写后点保存：

- API 密钥（写入 `$DSH_HOME/.credentials.yaml`，不进设置文件）
- 识图模型（默认 `qwen-vl-plus`）
- 识图 API 地址（默认阿里云 DashScope compatible-mode）

不需要再单独安装 `claude-vision-skill`，也不需要改 Agent 预设。

## 怎么确认可用

1. `--dump-config` 里能看到 `dsh-image-pathify`
2. 设置 → 插件里出现 **识图** 卡片
3. 给不能看图的模型发一张图：界面里缩略图还在；模型调用 `analyze_image` 而不是 `read_image`

## 配置

设置页改动保存后立即生效。也可以写在 `$DSH_HOME/profiles/<name>/cordis.patch.yml`：

| 选项             | 默认                                                | 做什么                                                               |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `apiKeyEnv`      | `IMAGE_PATHIFY_API_KEY`                             | 凭据引用名。密钥本身写在 `$DSH_HOME/.credentials.yaml`，不进设置文件 |
| `visionModel`    | `qwen-vl-plus`                                      | 识图模型 id                                                          |
| `visionBaseUrl`  | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容基址                                                      |
| `prefix`         | `Saved attachments: `                               | 路径前面那句固定文字，通常无需修改                                   |
| `models`         | 空 = 全部不能看图的模型                             | 只决定**哪些模型允许你发图**。空 = 都能发。填了就只放行名单里的模型  |
| `relaxAdmission` | `true`                                              | 允许给不能看图的模型发图。关闭后按模型能力拒绝贴图                   |

只允许 deepseek-v4-flash 发图的例子：

```yaml
- id: dsh-image-pathify
  config:
    models:
      - provider: deepseek-official
        model: deepseek-v4-flash
```

更完整的说明见 [docs/识图.md](docs/识图.md)。

## 开发与构建

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

也可以只跑 `pnpm check`：它会按顺序执行 `typecheck`、`test`、`build`。

## License

MIT
