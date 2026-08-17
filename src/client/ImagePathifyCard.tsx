/** Vision plugin card: staged settings under Settings → Plugins. */

import { useEffect, useState, type ReactElement } from "react";
import type { PathifyModelEntry } from "../contract.ts";
import type { ImagePathifyCardState } from "./card-form.ts";
import { fmt, type ImagePathifyKey } from "./locales.ts";

/** Injected business face: snapshot store plus form actions. */
export interface ImagePathifyCardInjected {
  hooks: {
    imagePathifyCard: {
      getSnapshot(): ImagePathifyCardState;
      subscribe(fn: () => void): () => void;
    };
  };
  edit: (field: string, text: string) => void;
  resetField: (field: string) => void;
  save: () => void;
  discard: () => void;
  setRelaxAdmission: (value: boolean) => void;
  addModel: (provider: string, model: string) => void;
  removeModel: (provider: string, model: string) => void;
}

/** Props the renderer binds for the Vision card. */
export interface ImagePathifyCardProps {
  useImagePathifyCard: <T>(selector: (state: ImagePathifyCardState) => T) => T;
  t: (key: ImagePathifyKey, params?: Record<string, string>) => string;
  edit: (field: string, text: string) => void;
  resetField: (field: string) => void;
  save: () => void;
  discard: () => void;
  setRelaxAdmission: (value: boolean) => void;
  addModel: (provider: string, model: string) => void;
  removeModel: (provider: string, model: string) => void;
}

function ChevronIcon({ className }: { className: string }): ReactElement {
  return (
    <svg
      width={14}
      height={14}
      className={className}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RemoveIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="m4 4 8 8m0-8-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden width="12" height="12">
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      return ok;
    } catch {
      return false;
    }
  }
}

function modelKey(entry: PathifyModelEntry): string {
  return `${entry.provider}\0${entry.model}`;
}

function OverrideBadges({
  overridden,
  disabled,
  overriddenLabel,
  resetLabel,
  onReset,
}: {
  overridden: boolean;
  disabled: boolean;
  overriddenLabel: string;
  resetLabel: string;
  onReset: () => void;
}): ReactElement | null {
  if (!overridden) return null;
  return (
    <span className="dsh_imagePathify_badges">
      <span className="dsh_imagePathify_badge">{overriddenLabel}</span>
      <button
        type="button"
        className="dsh_imagePathify_reset"
        disabled={disabled}
        onClick={onReset}
      >
        {resetLabel}
      </button>
    </span>
  );
}

/** Render the Vision plugin card. */
export function ImagePathifyCard({
  useImagePathifyCard,
  t,
  edit,
  resetField,
  save,
  discard,
  setRelaxAdmission,
  addModel,
  removeModel,
}: ImagePathifyCardProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [providerDraft, setProviderDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const state = useImagePathifyCard((snapshot) => snapshot);
  useEffect(() => {
    if (copyState === "idle") return;
    const id = window.setTimeout(() => {
      setCopyState("idle");
    }, 2000);
    return () => {
      window.clearTimeout(id);
    };
  }, [copyState]);
  if (!state.available) return null;

  const title = t("title");
  const disabled = !state.writable || state.saving;
  const blocked = !state.dirty || state.invalid || state.saving;
  const translate = (
    key: ImagePathifyKey,
    params?: Record<string, string>,
  ): string => fmt(t(key), params);

  const commitModel = (): void => {
    const provider = providerDraft.trim();
    const model = modelDraft.trim();
    if (provider.length === 0 || model.length === 0 || disabled) return;
    addModel(provider, model);
    setProviderDraft("");
    setModelDraft("");
  };

  const copyUpgrade = (): void => {
    const command = state.update?.command;
    if (command === undefined) return;
    void copyText(command).then((ok) => {
      setCopyState(ok ? "copied" : "failed");
    });
  };

  const copyLabel =
    copyState === "copied"
      ? t("updateCopied")
      : copyState === "failed"
        ? t("updateCopyFail")
        : t("updateCopy");

  return (
    <li
      className={
        open
          ? "dsh_imagePathify_card dsh_imagePathify_cardOpen"
          : "dsh_imagePathify_card"
      }
    >
      <div
        className={
          state.update !== undefined
            ? "dsh_imagePathify_head dsh_imagePathify_headHasUpdate"
            : "dsh_imagePathify_head"
        }
      >
        <button
          type="button"
          className="dsh_imagePathify_header"
          aria-expanded={open}
          aria-label={`${t(open ? "collapse" : "expand")}: ${title}`}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <span className="dsh_imagePathify_headText">
            <span className="dsh_imagePathify_name">{title}</span>
            <span className="dsh_imagePathify_description">
              {t("description")}
            </span>
          </span>
          {state.dirty ? (
            <span className="dsh_imagePathify_pending">{t("unsaved")}</span>
          ) : null}
          <ChevronIcon
            className={
              open
                ? "dsh_imagePathify_chevron dsh_imagePathify_chevronOpen"
                : "dsh_imagePathify_chevron"
            }
          />
        </button>
        {state.update !== undefined ? (
          <div className="dsh_imagePathify_update" role="status">
            <span className="dsh_imagePathify_updateText">
              {translate("updateHint", {
                old: state.update.installedVersion,
                new: state.update.latestVersion,
              })}
            </span>
            <button
              type="button"
              className="dsh_imagePathify_updateCopy"
              onClick={copyUpgrade}
            >
              {copyLabel}
            </button>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="dsh_imagePathify_body">
          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <label
                className="dsh_imagePathify_label"
                htmlFor="plugin-config-image-pathify-key"
              >
                {t("apiKey")}
              </label>
              <span className="dsh_imagePathify_badges">
                <span
                  className={
                    state.apiKeySet
                      ? "dsh_imagePathify_badge"
                      : "dsh_imagePathify_badgeMuted"
                  }
                >
                  {state.apiKeySet ? t("apiKeySet") : t("apiKeyUnset")}
                </span>
              </span>
            </div>
            <input
              id="plugin-config-image-pathify-key"
              className="dsh_imagePathify_input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={state.apiKeyText}
              disabled={state.saving || !state.apiKeyWritable}
              onChange={(event) => {
                edit("apiKey", event.target.value);
              }}
            />
            <p className="dsh_imagePathify_hint">{t("apiKeyHint")}</p>
          </div>

          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <label
                className="dsh_imagePathify_label"
                htmlFor="plugin-config-image-pathify-model"
              >
                {t("visionModel")}
              </label>
              <OverrideBadges
                overridden={state.visionModel.overridden}
                disabled={disabled}
                overriddenLabel={t("overridden")}
                resetLabel={t("reset")}
                onReset={() => {
                  resetField("visionModel");
                }}
              />
            </div>
            <input
              id="plugin-config-image-pathify-model"
              className="dsh_imagePathify_input"
              spellCheck={false}
              value={state.visionModel.text}
              disabled={disabled}
              onChange={(event) => {
                edit("visionModel", event.target.value);
              }}
            />
            <p className="dsh_imagePathify_hint">{t("visionModelHint")}</p>
          </div>

          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <label
                className="dsh_imagePathify_label"
                htmlFor="plugin-config-image-pathify-url"
              >
                {t("visionBaseUrl")}
              </label>
              <OverrideBadges
                overridden={state.visionBaseUrl.overridden}
                disabled={disabled}
                overriddenLabel={t("overridden")}
                resetLabel={t("reset")}
                onReset={() => {
                  resetField("visionBaseUrl");
                }}
              />
            </div>
            <input
              id="plugin-config-image-pathify-url"
              className="dsh_imagePathify_input"
              spellCheck={false}
              value={state.visionBaseUrl.text}
              disabled={disabled}
              onChange={(event) => {
                edit("visionBaseUrl", event.target.value);
              }}
            />
            <p className="dsh_imagePathify_hint">{t("visionBaseUrlHint")}</p>
          </div>

          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <label
                className="dsh_imagePathify_label"
                htmlFor="plugin-config-image-pathify-single-max-tokens"
              >
                {t("singleMaxTokens")}
              </label>
              <OverrideBadges
                overridden={state.singleMaxTokens.overridden}
                disabled={disabled}
                overriddenLabel={t("overridden")}
                resetLabel={t("reset")}
                onReset={() => {
                  resetField("singleMaxTokens");
                }}
              />
            </div>
            <input
              id="plugin-config-image-pathify-single-max-tokens"
              className="dsh_imagePathify_input"
              inputMode="numeric"
              spellCheck={false}
              value={state.singleMaxTokens.text}
              disabled={disabled}
              onChange={(event) => {
                edit("singleMaxTokens", event.target.value);
              }}
            />
            <p className="dsh_imagePathify_hint">{t("singleMaxTokensHint")}</p>
          </div>

          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <label
                className="dsh_imagePathify_label"
                htmlFor="plugin-config-image-pathify-multi-max-tokens"
              >
                {t("multiMaxTokens")}
              </label>
              <OverrideBadges
                overridden={state.multiMaxTokens.overridden}
                disabled={disabled}
                overriddenLabel={t("overridden")}
                resetLabel={t("reset")}
                onReset={() => {
                  resetField("multiMaxTokens");
                }}
              />
            </div>
            <input
              id="plugin-config-image-pathify-multi-max-tokens"
              className="dsh_imagePathify_input"
              inputMode="numeric"
              spellCheck={false}
              value={state.multiMaxTokens.text}
              disabled={disabled}
              onChange={(event) => {
                edit("multiMaxTokens", event.target.value);
              }}
            />
            <p className="dsh_imagePathify_hint">{t("multiMaxTokensHint")}</p>
          </div>

          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <label
                className="dsh_imagePathify_label"
                htmlFor="plugin-config-image-pathify-prefix"
              >
                {t("prefix")}
              </label>
              <OverrideBadges
                overridden={state.prefix.overridden}
                disabled={disabled}
                overriddenLabel={t("overridden")}
                resetLabel={t("reset")}
                onReset={() => {
                  resetField("prefix");
                }}
              />
            </div>
            <input
              id="plugin-config-image-pathify-prefix"
              className="dsh_imagePathify_input"
              spellCheck={false}
              value={state.prefix.text}
              disabled={disabled}
              onChange={(event) => {
                edit("prefix", event.target.value);
              }}
            />
            <p className="dsh_imagePathify_hint">{t("prefixHint")}</p>
          </div>

          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <label className="dsh_imagePathify_toggle">
                <input
                  type="checkbox"
                  checked={state.relaxAdmission.checked}
                  disabled={disabled}
                  onChange={(event) => {
                    setRelaxAdmission(event.target.checked);
                  }}
                />
                <span className="dsh_imagePathify_label">
                  {t("relaxAdmission")}
                </span>
              </label>
              <OverrideBadges
                overridden={state.relaxAdmission.overridden}
                disabled={disabled}
                overriddenLabel={t("overridden")}
                resetLabel={t("reset")}
                onReset={() => {
                  resetField("relaxAdmission");
                }}
              />
            </div>
            <p className="dsh_imagePathify_hint">{t("relaxAdmissionHint")}</p>
          </div>

          <div className="dsh_imagePathify_field">
            <div className="dsh_imagePathify_fieldHead">
              <span className="dsh_imagePathify_label">{t("models")}</span>
              <OverrideBadges
                overridden={state.models.overridden}
                disabled={disabled}
                overriddenLabel={t("overridden")}
                resetLabel={t("reset")}
                onReset={() => {
                  resetField("models");
                }}
              />
            </div>
            <p className="dsh_imagePathify_hint">{t("modelsHint")}</p>
            <div className="dsh_imagePathify_list" aria-live="polite">
              {state.models.entries.length === 0 ? (
                <div className="dsh_imagePathify_empty">{t("modelsEmpty")}</div>
              ) : (
                state.models.entries.map((entry) => (
                  <div
                    className="dsh_imagePathify_filterRow"
                    key={modelKey(entry)}
                  >
                    <code className="dsh_imagePathify_filterName">
                      {entry.provider} / {entry.model}
                    </code>
                    <button
                      type="button"
                      className="dsh_imagePathify_filterRemove"
                      title={translate("remove", {
                        name: `${entry.provider}/${entry.model}`,
                      })}
                      aria-label={translate("remove", {
                        name: `${entry.provider}/${entry.model}`,
                      })}
                      disabled={disabled}
                      onClick={() => {
                        removeModel(entry.provider, entry.model);
                      }}
                    >
                      <RemoveIcon />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="dsh_imagePathify_row">
              <input
                className="dsh_imagePathify_input"
                spellCheck={false}
                disabled={disabled}
                value={providerDraft}
                placeholder={t("providerPlaceholder")}
                onChange={(event) => {
                  setProviderDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  commitModel();
                }}
              />
              <input
                className="dsh_imagePathify_input"
                spellCheck={false}
                disabled={disabled}
                value={modelDraft}
                placeholder={t("modelPlaceholder")}
                onChange={(event) => {
                  setModelDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  commitModel();
                }}
              />
              <button
                type="button"
                className="dsh_imagePathify_addButton"
                disabled={
                  disabled ||
                  providerDraft.trim().length === 0 ||
                  modelDraft.trim().length === 0
                }
                onClick={() => {
                  commitModel();
                }}
              >
                <PlusIcon />
                <span>{t("add")}</span>
              </button>
            </div>
          </div>

          <div className="dsh_imagePathify_footer">
            {state.failed ? (
              <p className="dsh_imagePathify_failed" role="status">
                {t("saveFailed")}
              </p>
            ) : null}
            <button
              type="button"
              className="dsh_imagePathify_discard"
              disabled={!state.dirty || state.saving}
              onClick={discard}
            >
              {t("discard")}
            </button>
            <button
              type="button"
              className="dsh_imagePathify_save"
              disabled={blocked}
              onClick={save}
            >
              {t(state.saving ? "saving" : "save")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
