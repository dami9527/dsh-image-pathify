# dsh-image-pathify

让 **deepseek-v4-flash** 这类「不能看图」的模型，也能处理你贴进聊天里的图片，并直接调用插件内置的识图工具。

聊天记录和界面里的缩略图**不会变**。插件只在把消息发给模型前，把图片换成一行本地文件路径；模型再调用 `analyze_image` 读这个文件，通过你配置的视觉 API 得到文字描述。

```
你贴一张图  →  聊天里照常显示缩略图
           ↓
发给不能看图的模型前  →  变成：Saved attachments: /某路径/某文件
           ↓
模型调用 analyze_image  →  视觉 API 返回文字描述（多张图一次请求、同一次看见全部）
```

已经能看图的模型不受影响：图片会原样发给它们，`analyze_image` 不会出现在它们的工具列表和系统提示里。`read_image` 在不能看图的模型上会被拒绝，并提示改用 `analyze_image`。

磁盘上的图片文件是 **dsh 自己保存的附件**（`~/.dsh/attachments/v1/...`），不是本插件另存的一份。

## 安装

```sh
dsh plugin --profile web add dsh-image-pathify
dsh --profile web --dump-config   # 能看到 dsh-image-pathify 就装好了
dsh web
```

打开 **设置 → 插件 → 识图**，填写后点保存：

- API 密钥（写入 `$DSH_HOME/.credentials.yaml`，不进设置文件）
- 识图模型（默认 `qwen-vl-plus`）
- 识图 API 地址（默认阿里云 DashScope compatible-mode）

任何 OpenAI 兼容的视觉接口都可以，把地址和模型改成你的服务即可。设置页改动保存后立即生效，不用重启。

![设置 → 插件 → 识图](access/settings.png)

## 更新

已装版本落后于 npm 最新版时，**识图**卡片 header（不用展开）会显示「发现新版本 x → y」和 **复制升级命令**。点按钮把命令复制到剪贴板（钉死探测到的版本号，不要用 `@latest`），然后：

1. 结束当前正在跑的 `dsh web`（终端里 `Ctrl+C`）
2. 执行复制出来的命令：

```sh
dsh plugin --profile web add dsh-image-pathify@version
```

1. 再启动 `dsh web`

插件不会自动改你机器上的包。查询失败或已是最新时，卡片上不显示任何提示。

## 怎么确认可用

1. `--dump-config` 里能看到 `dsh-image-pathify`
2. 设置 → 插件里出现 **识图** 卡片
3. 给不能看图的模型发一张图：界面里缩略图还在；模型调用 `analyze_image` 而不是 `read_image`
4. 给不能看图的模型发本地图片路径或图片URL：应直接调用 `analyze_image`，不要先 `read_image`
5. 给能看图的模型发一张图：模型直接回答，不调用 `analyze_image`
6. 给能看图的模型发本地图片路径或图片URL：应直接调用 `read_image`，不要先 `analyze_image`

![给不能看图的模型发图，模型调用 analyze_image](access/example.png)

## 配置

设置页保存后立即生效。识图字段写在 `$DSH_HOME/settings.yaml` 的 `image-pathify` 段；API 密钥写在 `$DSH_HOME/.credentials.yaml`，不进设置文件。

| 选项              | 默认                                                | 做什么                                                               |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `apiKeyEnv`       | `IMAGE_PATHIFY_API_KEY`                             | 凭据引用名。密钥本身写在 `$DSH_HOME/.credentials.yaml`，不进设置文件 |
| `visionModel`     | `qwen-vl-plus`                                      | 识图模型 id                                                          |
| `visionBaseUrl`   | `https://dashscope.aliyuncs.com/compatible-mode/v1` | OpenAI 兼容基址                                                      |
| `singleMaxTokens` | `1024`                                              | 一张图时视觉模型最多能写多长。截图细节不够可调大                     |
| `multiMaxTokens`  | `4096`                                              | 一次识别多张图时的输出上限。描述被截断可调大                         |
| `models`          | 空 = 全部不能看图的模型                             | 只决定**哪些模型允许你发图**。空 = 都能发。填了就只放行名单里的模型  |
| `relaxAdmission`  | `true`                                              | 允许给不能看图的模型发图。关闭后按模型能力拒绝贴图                   |

只允许 deepseek-v4-flash 发图的例子：

```yaml
image-pathify:
  models:
    - provider: deepseek-official
      model: deepseek-v4-flash
```

模型侧只多一个工具 `analyze_image`（仅不能看图的模型能看见、能调用）。

- 一张图：`image` 填本地绝对路径或 `http(s)` 图片 URL（不要带路径前缀）
- 多张图：用 `images` 一次传入全部路径，插件会在**同一次**视觉请求里带上所有图片，不必一张一张等
- `prompt` 可选

同一轮里有多张图时，系统提示会要求模型把所有路径放进一次 `analyze_image` 调用，而不是循环调用。

## 开发与构建

```sh
pnpm install
pnpm check
```

`pnpm check` 会按顺序执行 `typecheck`、`test`、`build`。

## License

MIT
