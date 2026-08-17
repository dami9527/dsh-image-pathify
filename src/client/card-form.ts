/**
 * Staged form behind the Vision plugin card. Edits stay local until save.
 * The API key is a write-only control: it never rides a settings response
 * and is stored through the credentials domain, not the settings document.
 * @module dsh-image-pathify/client/card-form
 */

import type {
  ImagePathifyPublicSettings,
  ImagePathifySettingsUpdate,
  ImagePathifyUpdateStatus,
  PathifyModelEntry,
} from "../contract.ts";
import { defaultPublicSettings } from "../contract.ts";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_MULTI_MAX_TOKENS,
  DEFAULT_SINGLE_MAX_TOKENS,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
  MAX_VISION_MAX_TOKENS,
} from "../defaults.ts";
import { createSnapshotStore, type SnapshotStore } from "./store.ts";

/** One text control as the card renders it. */
export interface CardFieldState {
  text: string;
  overridden: boolean;
}

/** Credentials-domain face the card uses for the referenced key. */
export interface VisionCredentialFace {
  describe(ref: string): Promise<{ configured: boolean; writable: boolean }>;
  set(ref: string, value: string): Promise<void>;
}

/** Idle credentials face for tests that do not exercise the key control. */
export const idleCredentials: VisionCredentialFace = {
  describe: async () => ({ configured: false, writable: true }),
  set: async () => {},
};

/** Form state every plugin card shares, plus Vision-specific controls. */
export interface ImagePathifyCardState {
  available: boolean;
  writable: boolean;
  dirty: boolean;
  invalid: boolean;
  saving: boolean;
  failed: boolean;
  apiKeyText: string;
  apiKeySet: boolean;
  apiKeyWritable: boolean;
  visionModel: CardFieldState;
  visionBaseUrl: CardFieldState;
  singleMaxTokens: CardFieldState;
  multiMaxTokens: CardFieldState;
  relaxAdmission: { checked: boolean; overridden: boolean };
  models: { entries: readonly PathifyModelEntry[]; overridden: boolean };
  update:
    | {
        installedVersion: string;
        latestVersion: string;
        command: string;
      }
    | undefined;
}

/** Actions the card's slot entry injects. */
export interface ImagePathifyCardActions {
  edit: (field: string, text: string) => void;
  resetField: (field: string) => void;
  save: () => void;
  discard: () => void;
  setRelaxAdmission: (value: boolean) => void;
  addModel: (provider: string, model: string) => void;
  removeModel: (provider: string, model: string) => void;
}

const DEFAULTS = defaultPublicSettings();

function modelsEqual(
  left: readonly PathifyModelEntry[],
  right: readonly PathifyModelEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.provider === right[index]?.provider &&
        entry.model === right[index]?.model,
    )
  );
}

function cloneModels(
  entries: readonly PathifyModelEntry[],
): PathifyModelEntry[] {
  return entries.map((entry) => ({
    provider: entry.provider,
    model: entry.model,
  }));
}

function modelKey(entry: PathifyModelEntry): string {
  return `${entry.provider}\0${entry.model}`;
}

function refOf(settings: ImagePathifyPublicSettings): string {
  const declared = settings.apiKeyEnv.trim();
  return declared.length > 0 ? declared : DEFAULT_API_KEY_ENV;
}

/**
 * Parse a max-tokens field. Empty uses `fallback`. Non-integers and values
 * outside 1…32768 are invalid (`undefined`).
 */
export function parseMaxTokens(
  text: string,
  fallback: number,
): number | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return fallback;
  if (!/^[1-9]\d*$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (n > MAX_VISION_MAX_TOKENS) return undefined;
  return n;
}

/** Stages Vision settings over the plugin-owned Remote and writes them on save. */
export class ImagePathifyCardController {
  private stored: ImagePathifyPublicSettings = defaultPublicSettings();
  private available = false;
  private saving = false;
  private failed = false;
  private apiKeyDraft: string | undefined;
  private visionModelDraft: string | undefined;
  private visionBaseUrlDraft: string | undefined;
  private singleMaxTokensDraft: string | undefined;
  private multiMaxTokensDraft: string | undefined;
  private relaxDraft: boolean | undefined;
  private modelsDraft: PathifyModelEntry[] | undefined;
  private credential = { ref: "", configured: false, writable: true };
  private update:
    | {
        installedVersion: string;
        latestVersion: string;
        command: string;
      }
    | undefined = undefined;
  private readonly store: SnapshotStore<ImagePathifyCardState>;

  constructor(
    private readonly write: (
      update: ImagePathifySettingsUpdate,
    ) => Promise<ImagePathifyPublicSettings>,
    private readonly credentials: VisionCredentialFace = idleCredentials,
  ) {
    this.store = createSnapshotStore(this.projection());
  }

  /** Snapshot the card renderer reads through `useImagePathifyCard`. */
  get snapshot(): SnapshotStore<ImagePathifyCardState> {
    return this.store;
  }

  /** Seed or refresh from the Host. Staged edits survive a reload. */
  receive(settings: ImagePathifyPublicSettings): void {
    this.stored = settings;
    this.available = true;
    this.publish();
    void this.syncCredential();
  }

  /** Hide the card while the Remote is down. */
  markUnavailable(): void {
    this.available = false;
    this.update = undefined;
    this.publish();
  }

  /**
   * Apply a host npm-probe result. Only an available update is kept; a
   * failed or current-version probe clears the header banner.
   */
  receiveUpdate(status: ImagePathifyUpdateStatus): void {
    this.update =
      status.updateAvailable &&
      status.installedVersion.length > 0 &&
      status.latestVersion.length > 0 &&
      status.command.length > 0
        ? {
            installedVersion: status.installedVersion,
            latestVersion: status.latestVersion,
            command: status.command,
          }
        : undefined;
    this.publish();
  }

  /**
   * Re-read whether the Host holds a key for the reference this card watches.
   * @param ref - when set, ignore updates for a different reference.
   */
  refreshCredential(ref?: string): void {
    if (ref !== undefined && ref !== this.credential.ref) return;
    void this.syncCredential();
  }

  /** Ask the credentials domain about the reference the section currently names. */
  async syncCredential(): Promise<void> {
    const ref = refOf(this.stored);
    if (ref !== this.credential.ref) {
      this.credential = { ref, configured: false, writable: true };
      this.publish();
    }
    let view: { configured: boolean; writable: boolean };
    try {
      view = await this.credentials.describe(ref);
    } catch {
      return;
    }
    if (ref !== refOf(this.stored)) return;
    if (
      view.configured === this.credential.configured &&
      view.writable === this.credential.writable
    ) {
      return;
    }
    this.credential = {
      ref,
      configured: view.configured,
      writable: view.writable,
    };
    this.publish();
  }

  /** Build the face the card's slot registration injects. */
  inject(): ImagePathifyCardActions & {
    hooks: { imagePathifyCard: SnapshotStore<ImagePathifyCardState> };
  } {
    return {
      hooks: { imagePathifyCard: this.store },
      edit: (field, text) => {
        this.edit(field, text);
      },
      resetField: (field) => {
        this.resetField(field);
      },
      save: () => {
        void this.save();
      },
      discard: () => {
        this.discard();
      },
      setRelaxAdmission: (value) => {
        this.setRelaxAdmission(value);
      },
      addModel: (provider, model) => {
        this.addModel(provider, model);
      },
      removeModel: (provider, model) => {
        this.removeModel(provider, model);
      },
    };
  }

  private projection(): ImagePathifyCardState {
    const visionModel = this.visionModelDraft ?? this.stored.visionModel;
    const visionBaseUrl = this.visionBaseUrlDraft ?? this.stored.visionBaseUrl;
    const singleMaxTokensText =
      this.singleMaxTokensDraft ?? String(this.stored.singleMaxTokens);
    const multiMaxTokensText =
      this.multiMaxTokensDraft ?? String(this.stored.multiMaxTokens);
    const relax = this.relaxDraft ?? this.stored.relaxAdmission;
    const models = this.modelsDraft ?? this.stored.models;
    const resolvedModel = this.effectiveModel(visionModel);
    const resolvedUrl = this.effectiveUrl(visionBaseUrl);
    const resolvedSingle = parseMaxTokens(
      singleMaxTokensText,
      DEFAULT_SINGLE_MAX_TOKENS,
    );
    const resolvedMulti = parseMaxTokens(
      multiMaxTokensText,
      DEFAULT_MULTI_MAX_TOKENS,
    );
    return {
      available: this.available,
      writable: true,
      dirty: this.isDirty(),
      invalid: resolvedSingle === undefined || resolvedMulti === undefined,
      saving: this.saving,
      failed: this.failed,
      apiKeyText: this.apiKeyDraft ?? "",
      apiKeySet: this.credential.configured,
      apiKeyWritable: this.credential.writable,
      visionModel: {
        text: visionModel,
        overridden: resolvedModel !== DEFAULT_VISION_MODEL,
      },
      visionBaseUrl: {
        text: visionBaseUrl,
        overridden: resolvedUrl !== DEFAULT_VISION_BASE_URL,
      },
      singleMaxTokens: {
        text: singleMaxTokensText,
        overridden:
          resolvedSingle !== undefined &&
          resolvedSingle !== DEFAULT_SINGLE_MAX_TOKENS,
      },
      multiMaxTokens: {
        text: multiMaxTokensText,
        overridden:
          resolvedMulti !== undefined &&
          resolvedMulti !== DEFAULT_MULTI_MAX_TOKENS,
      },
      relaxAdmission: {
        checked: relax,
        overridden: relax !== DEFAULTS.relaxAdmission,
      },
      models: {
        entries: models,
        overridden: !modelsEqual(models, DEFAULTS.models),
      },
      update: this.update,
    };
  }

  private isDirty(): boolean {
    if (this.apiKeyDraft !== undefined && this.apiKeyDraft.trim() !== "") {
      return true;
    }
    if (
      this.visionModelDraft !== undefined &&
      this.effectiveModel(this.visionModelDraft) !==
        this.effectiveModel(this.stored.visionModel)
    ) {
      return true;
    }
    if (
      this.visionBaseUrlDraft !== undefined &&
      this.effectiveUrl(this.visionBaseUrlDraft) !==
        this.effectiveUrl(this.stored.visionBaseUrl)
    ) {
      return true;
    }
    if (this.tokenDraftDirty("single")) return true;
    if (this.tokenDraftDirty("multi")) return true;
    if (
      this.relaxDraft !== undefined &&
      this.relaxDraft !== this.stored.relaxAdmission
    ) {
      return true;
    }
    if (
      this.modelsDraft !== undefined &&
      !modelsEqual(this.modelsDraft, this.stored.models)
    ) {
      return true;
    }
    return false;
  }

  private effectiveModel(value: string): string {
    const trimmed = value.trim();
    return trimmed === "" ? DEFAULT_VISION_MODEL : trimmed;
  }

  private effectiveUrl(value: string): string {
    const trimmed = value.trim();
    return trimmed === "" ? DEFAULT_VISION_BASE_URL : trimmed;
  }

  private tokenDraftDirty(kind: "single" | "multi"): boolean {
    const draft =
      kind === "single" ? this.singleMaxTokensDraft : this.multiMaxTokensDraft;
    if (draft === undefined) return false;
    const fallback =
      kind === "single" ? DEFAULT_SINGLE_MAX_TOKENS : DEFAULT_MULTI_MAX_TOKENS;
    const stored =
      kind === "single"
        ? this.stored.singleMaxTokens
        : this.stored.multiMaxTokens;
    const parsed = parseMaxTokens(draft, fallback);
    return parsed === undefined || parsed !== stored;
  }

  private edit(field: string, text: string): void {
    this.failed = false;
    if (field === "apiKey") {
      this.apiKeyDraft = text;
    } else if (field === "visionModel") {
      this.visionModelDraft = text;
    } else if (field === "visionBaseUrl") {
      this.visionBaseUrlDraft = text;
    } else if (field === "singleMaxTokens") {
      this.singleMaxTokensDraft = text;
    } else if (field === "multiMaxTokens") {
      this.multiMaxTokensDraft = text;
    }
    this.publish();
  }

  private resetField(field: string): void {
    this.failed = false;
    if (field === "visionModel") this.visionModelDraft = DEFAULT_VISION_MODEL;
    else if (field === "visionBaseUrl") {
      this.visionBaseUrlDraft = DEFAULT_VISION_BASE_URL;
    } else if (field === "singleMaxTokens") {
      this.singleMaxTokensDraft = String(DEFAULT_SINGLE_MAX_TOKENS);
    } else if (field === "multiMaxTokens") {
      this.multiMaxTokensDraft = String(DEFAULT_MULTI_MAX_TOKENS);
    } else if (field === "relaxAdmission") {
      this.relaxDraft = DEFAULTS.relaxAdmission;
    } else if (field === "models") this.modelsDraft = [];
    this.publish();
  }

  private setRelaxAdmission(value: boolean): void {
    this.failed = false;
    this.relaxDraft = value;
    this.publish();
  }

  private addModel(provider: string, model: string): void {
    const nextProvider = provider.trim();
    const nextModel = model.trim();
    if (nextProvider.length === 0 || nextModel.length === 0) return;
    this.failed = false;
    const current = cloneModels(this.modelsDraft ?? this.stored.models);
    const entry = { provider: nextProvider, model: nextModel };
    if (current.some((item) => modelKey(item) === modelKey(entry))) {
      this.modelsDraft = current;
      this.publish();
      return;
    }
    this.modelsDraft = [...current, entry];
    this.publish();
  }

  private removeModel(provider: string, model: string): void {
    this.failed = false;
    const key = modelKey({ provider, model });
    const current = this.modelsDraft ?? this.stored.models;
    this.modelsDraft = current.filter((item) => modelKey(item) !== key);
    this.publish();
  }

  private discard(): void {
    if (!this.isDirty() && !this.failed) return;
    this.apiKeyDraft = undefined;
    this.visionModelDraft = undefined;
    this.visionBaseUrlDraft = undefined;
    this.singleMaxTokensDraft = undefined;
    this.multiMaxTokensDraft = undefined;
    this.relaxDraft = undefined;
    this.modelsDraft = undefined;
    this.failed = false;
    this.publish();
  }

  private planSettings(): ImagePathifySettingsUpdate | undefined {
    const update: {
      visionModel?: string;
      visionBaseUrl?: string;
      singleMaxTokens?: number;
      multiMaxTokens?: number;
      relaxAdmission?: boolean;
      models?: PathifyModelEntry[];
    } = {};
    let dirty = false;
    const visionModel = this.effectiveModel(
      this.visionModelDraft ?? this.stored.visionModel,
    );
    if (visionModel !== this.effectiveModel(this.stored.visionModel)) {
      update.visionModel = visionModel;
      dirty = true;
    }
    const visionBaseUrl = this.effectiveUrl(
      this.visionBaseUrlDraft ?? this.stored.visionBaseUrl,
    );
    if (visionBaseUrl !== this.effectiveUrl(this.stored.visionBaseUrl)) {
      update.visionBaseUrl = visionBaseUrl;
      dirty = true;
    }
    const singleMaxTokens = parseMaxTokens(
      this.singleMaxTokensDraft ?? String(this.stored.singleMaxTokens),
      DEFAULT_SINGLE_MAX_TOKENS,
    );
    if (
      singleMaxTokens !== undefined &&
      singleMaxTokens !== this.stored.singleMaxTokens
    ) {
      update.singleMaxTokens = singleMaxTokens;
      dirty = true;
    }
    const multiMaxTokens = parseMaxTokens(
      this.multiMaxTokensDraft ?? String(this.stored.multiMaxTokens),
      DEFAULT_MULTI_MAX_TOKENS,
    );
    if (
      multiMaxTokens !== undefined &&
      multiMaxTokens !== this.stored.multiMaxTokens
    ) {
      update.multiMaxTokens = multiMaxTokens;
      dirty = true;
    }
    const relax = this.relaxDraft ?? this.stored.relaxAdmission;
    if (relax !== this.stored.relaxAdmission) {
      update.relaxAdmission = relax;
      dirty = true;
    }
    const models = this.modelsDraft ?? this.stored.models;
    if (!modelsEqual(models, this.stored.models)) {
      update.models = cloneModels(models);
      dirty = true;
    }
    return dirty ? update : undefined;
  }

  async save(): Promise<void> {
    const key = this.apiKeyDraft?.trim() ?? "";
    const update = this.planSettings();
    if ((key.length === 0 && update === undefined) || this.saving) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    let landed = true;
    try {
      if (key.length > 0) {
        try {
          await this.credentials.set(refOf(this.stored), key);
        } catch {
          landed = false;
        }
        await this.syncCredential();
        if (!this.credential.configured) landed = false;
      }
      if (update !== undefined) {
        this.stored = await this.write(update);
      }
    } catch {
      landed = false;
    }
    if (landed) {
      this.apiKeyDraft = undefined;
      this.visionModelDraft = undefined;
      this.visionBaseUrlDraft = undefined;
      this.singleMaxTokensDraft = undefined;
      this.multiMaxTokensDraft = undefined;
      this.relaxDraft = undefined;
      this.modelsDraft = undefined;
    } else {
      this.failed = true;
    }
    this.saving = false;
    this.publish();
  }

  private publish(): void {
    this.store.set(this.projection());
  }
}
