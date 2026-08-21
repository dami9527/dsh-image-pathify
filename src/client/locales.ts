/**
 * `image-pathify` locale namespace: plugin-card copy.
 * Chinese is the product copy; English mirrors it.
 */
import type {} from "@deepseek-ai/dsh-client-ui-slots";

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  title: "识图",
  description: "给不能看图的模型配置视觉接口。",
  expand: "展开设置",
  collapse: "收起设置",
  unsaved: "未保存",
  save: "保存",
  saving: "保存中…",
  discard: "放弃修改",
  saveFailed: "保存失败，修改已保留，请检查后重试。",
  overridden: "已覆盖",
  reset: "恢复默认",
  apiKey: "API Key",
  apiKeyHint: "不写入设置文件。留空表示保持当前密钥。",
  apiKeySet: "已配置密钥。",
  apiKeyUnset: "未配置密钥；配置之前插件不可识图。",
  visionModel: "识图模型",
  visionModelHint:
    "默认 deepseek-v4-flash-vision-exp。也可填千问/智谱等 OpenAI 兼容识图模型。",
  disableThinking: "禁用思考",
  disableThinkingOffHint:
    "思考会占用输出额度，请增大输出上限，或填 0 不传 max_tokens。",
  visionBaseUrl: "接口地址",
  visionBaseUrlHint:
    "默认 https://api.deepseek.com。支持任何 OpenAI 兼容格式 URL(部分地址需要后面加/v1)。",
  maxTokens: "输出上限",
  maxTokensHint:
    "视觉模型输出上限，填 0 表示不传 max_tokens，响应被截断可调大。",
  relaxAdmission: "允许给不能看图的模型发图",
  relaxAdmissionHint: "关闭后按模型能力拒绝贴图。",
  models: "放行的模型",
  modelsHint: "空表示全部放行。",
  modelsEmpty: "当前放行全部不能看图的模型。",
  providerPlaceholder: "provider",
  modelPlaceholder: "model",
  add: "添加",
  remove: "移除 {name}",
  updateHint: "发现新版本 {old} → {new}",
  updateCopy: "复制升级命令",
  updateCopied: "已复制",
  updateCopyFail: "复制失败",
} satisfies Record<string, string>;

/** The `image-pathify` namespace key union. */
export type ImagePathifyKey = keyof typeof zh;

/** English dictionary, checked complete against the zh key set. */
export const en = {
  title: "Vision",
  description: "Vision API for models that cannot see images.",
  expand: "Show settings",
  collapse: "Hide settings",
  unsaved: "Unsaved",
  save: "Save",
  saving: "Saving…",
  discard: "Discard",
  saveFailed: "Save failed. Your edits were kept — check them and try again.",
  overridden: "Overridden",
  reset: "Reset to default",
  apiKey: "API key",
  apiKeyHint:
    "Stored outside the settings file. Leave blank to keep the current key.",
  apiKeySet: "A key is configured.",
  apiKeyUnset: "No key is configured; vision is unavailable until one is.",
  visionModel: "Vision model",
  visionModelHint:
    "Default is deepseek-v4-flash-vision-exp. You can also use Qwen, GLM, or other OpenAI-compatible vision models.",
  disableThinking: "Disable thinking",
  disableThinkingOffHint:
    "Thinking consumes the output budget. Raise the cap, or set it to 0 to omit max_tokens.",
  visionBaseUrl: "Endpoint",
  visionBaseUrlHint:
    "Default is https://api.deepseek.com. Any OpenAI-compatible URL (some addresses need /v1 appended).",
  maxTokens: "Output cap",
  maxTokensHint:
    "Vision model output cap. Set 0 to omit max_tokens. Raise this if the response is truncated.",
  relaxAdmission: "Allow images on text-only models",
  relaxAdmissionHint: "Turn off to reject pasted images by model capability.",
  models: "Allowed models",
  modelsHint: "Empty admits every text-only model.",
  modelsEmpty: "Every text-only model is currently admitted.",
  providerPlaceholder: "provider",
  modelPlaceholder: "model",
  add: "Add",
  remove: "Remove {name}",
  updateHint: "Update available: {old} → {new}",
  updateCopy: "Copy upgrade command",
  updateCopied: "Copied",
  updateCopyFail: "Copy failed",
} satisfies Record<ImagePathifyKey, string>;

/** Locale namespace id registered under ctx.locale. */
export const NS = "image-pathify";

/**
 * Fill one dictionary template's `{name}`-style placeholders.
 */
export function fmt(template: string, params?: Record<string, string>): string {
  if (params === undefined) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (whole, key: string) => params[key] ?? whole,
  );
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Vision plugin-card copy. */
    [NS]: ImagePathifyKey;
  }
}
