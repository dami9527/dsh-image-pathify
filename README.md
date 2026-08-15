# dsh-image-pathify

让 **deepseek-v4-flash** 这类「不能看图」的模型，也能处理你贴进聊天里的图片。

聊天记录和界面里的缩略图**不会变**。插件只在把消息发给模型前，把图片换成一行本地文件路径，模型再调用识图技能去读这个文件。

```
你贴一张图  →  聊天里照常显示缩略图
           ↓
发给不能看图的模型前  →  变成：Saved attachments: /某路径/某文件
           ↓
模型调用识图技能  →  读这个文件  →  用文字描述图片
```

已经能看图的模型不受影响，图片会原样发给它们。

磁盘上的图片文件是 **dsh 自己保存的附件**（`~/.dsh/attachments/v1/...`），不是本插件另存的一份。

## 使用前

这个插件只负责「把图片变成路径」。真正认图还需要安装识图技能 推荐：[claude-vision-skill](https://github.com/asuojun/claude-vision-skill)（用它自带的 `vision.js`）。

可以在系统提示词或技能说明里加上：

```
图片路径以 "Saved attachments: " 开头时，用
node <vision.js 的绝对路径> "<图片绝对路径>" "<问题>" 识别图片。
```

## 安装

把 `<name>` 换成你的 profile 名：

```sh
dsh plugin --profile <name> add dsh-image-pathify
dsh --profile <name> --dump-config   # 能看到 dsh-image-pathify 就装好了
dsh web                              # 打开 Web 界面后生效
```

## 怎么确认可用

1. `--dump-config` 里能看到 `dsh-image-pathify`
2. 给不能看图的模型发一张图：界面里缩略图还在；模型收到的是 `Saved attachments: ` 开头的路径，而不是报「不支持图片」

## 配置（一般不用改）

默认开箱即用。如果要改，写在：

`$DSH_HOME/profiles/<name>/cordis.patch.yml`

| 选项             | 默认                    | 做什么                                                                     |
| ---------------- | ----------------------- | -------------------------------------------------------------------------- |
| `prefix`         | `Saved attachments: `   | 路径前面那句固定文字（末尾有空格）                                         |
| `models`         | 空 = 全部不能看图的模型 | 只决定**哪些模型允许你发图**。空 = 都能发。填了就只放行名单里的模型        |
| `relaxAdmission` | `true`                  | 要不要帮你「允许给不能看图的模型发图」。dsh 自己已经允许的话，改成 `false` |

只允许 deepseek-v4-flash 发图的例子：

```yaml
- id: dsh-image-pathify
  config:
    models:
      - provider: deepseek-official
        model: deepseek-v4-flash
```

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
