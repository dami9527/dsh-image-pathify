/**
 * Plugin-card stylesheet, injected once as a string. Tokens come only from
 * `--dsw-alias-*`. Class names carry the `dsh_imagePathify` prefix.
 */

/** Stable `<style>` element id (idempotent injection across HMR re-runs). */
export const STYLE_ID = "dsh-image-pathify-style";

/** The card's injected stylesheet text. */
export const cssText = `
.dsh_imagePathify_card {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
  transition: border-color .16s, background .16s;
}
.dsh_imagePathify_card:hover {
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_imagePathify_cardOpen {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_imagePathify_header {
  width: 100%;
  appearance: none;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
}
.dsh_imagePathify_header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh_imagePathify_headText {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh_imagePathify_nameRow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.dsh_imagePathify_name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--dsw-alias-label-primary);
}
.dsh_imagePathify_version {
  flex: none;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}
.dsh_imagePathify_description {
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh_imagePathify_pending {
  flex: none;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh_imagePathify_chevron {
  flex: none;
  display: block;
  color: var(--dsw-alias-label-tertiary);
  transition: transform .16s;
}
.dsh_imagePathify_chevronOpen {
  transform: rotate(180deg);
}
.dsh_imagePathify_body {
  border-top: 1px solid var(--dsw-alias-border-l2);
  margin: 0 16px;
  padding-bottom: 8px;
}
.dsh_imagePathify_field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}
.dsh_imagePathify_field + .dsh_imagePathify_field {
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh_imagePathify_fieldHead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh_imagePathify_label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh_imagePathify_badges {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dsh_imagePathify_badge {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  font-weight: 500;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh_imagePathify_badgeMuted {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
}
.dsh_imagePathify_reset {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh_imagePathify_reset:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
.dsh_imagePathify_reset:disabled {
  cursor: default;
}
.dsh_imagePathify_input {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh_imagePathify_input:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.dsh_imagePathify_input:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.dsh_imagePathify_hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh_imagePathify_toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
}
.dsh_imagePathify_toggle input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 3px 0 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.dsh_imagePathify_list {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
}
.dsh_imagePathify_filterRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  min-height: 36px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh_imagePathify_filterRow:last-child {
  border-bottom: 0;
}
.dsh_imagePathify_filterName {
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh_imagePathify_filterRemove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 14px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dsh_imagePathify_filterRemove:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.dsh_imagePathify_filterRemove svg,
.dsh_imagePathify_addButton svg {
  width: 12px;
  height: 12px;
}
.dsh_imagePathify_empty {
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
.dsh_imagePathify_row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dsh_imagePathify_row > .dsh_imagePathify_input {
  flex: 1 1 0;
  min-width: 0;
}
.dsh_imagePathify_modelRow {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.dsh_imagePathify_modelRow > .dsh_imagePathify_input {
  flex: 1 1 0;
  min-width: 0;
  width: 0;
}
.dsh_imagePathify_inlineToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  margin-left: auto;
  font-size: 12px;
  line-height: 1.4;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  white-space: nowrap;
}
.dsh_imagePathify_inlineToggle input {
  flex: none;
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.dsh_imagePathify_addButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh_imagePathify_addButton:hover:not(:disabled) {
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_imagePathify_addButton:disabled,
.dsh_imagePathify_filterRemove:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh_imagePathify_footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh_imagePathify_failed {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-state-error-primary);
}
.dsh_imagePathify_discard,
.dsh_imagePathify_save {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh_imagePathify_discard {
  border-color: var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh_imagePathify_discard:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_imagePathify_save {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
}
.dsh_imagePathify_discard:disabled,
.dsh_imagePathify_save:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh_imagePathify_discard:focus-visible,
.dsh_imagePathify_save:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh_imagePathify_headHasUpdate .dsh_imagePathify_header {
  padding-bottom: 8px;
}
.dsh_imagePathify_update {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 12px;
}
.dsh_imagePathify_updateText {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-state-warn-primary);
}
.dsh_imagePathify_updateCopy {
  appearance: none;
  flex: none;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 3px 10px;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  background: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh_imagePathify_updateCopy:hover {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh_imagePathify_updateCopy:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`;

/** Inject the stylesheet once into `document.head`. */
export function adoptStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = cssText;
  document.head.appendChild(style);
}
