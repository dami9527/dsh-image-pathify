/**
 * Staged form behind the Vision plugin card. Edits stay local until save.
 * @module dsh-image-pathify/client/card-form
 */

import type {
  ImagePathifyPublicSettings,
  ImagePathifySettingsUpdate,
  PathifyModelEntry,
} from "../contract.ts";
import { defaultPublicSettings } from "../contract.ts";
import {
  DEFAULT_PREFIX,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "../defaults.ts";
import { createSnapshotStore, type SnapshotStore } from "./store.ts";

/** One text control as the card renders it. */
export interface CardFieldState {
  text: string;
  overridden: boolean;
}

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
  visionModel: CardFieldState;
  visionBaseUrl: CardFieldState;
  prefix: CardFieldState;
  relaxAdmission: { checked: boolean; overridden: boolean };
  models: { entries: readonly PathifyModelEntry[]; overridden: boolean };
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

/** Stages Vision settings over the plugin-owned Remote and writes them on save. */
export class ImagePathifyCardController {
  private stored: ImagePathifyPublicSettings = defaultPublicSettings();
  private available = false;
  private saving = false;
  private failed = false;
  private apiKeyDraft: string | undefined;
  private visionModelDraft: string | undefined;
  private visionBaseUrlDraft: string | undefined;
  private prefixDraft: string | undefined;
  private relaxDraft: boolean | undefined;
  private modelsDraft: PathifyModelEntry[] | undefined;
  private readonly store: SnapshotStore<ImagePathifyCardState>;

  constructor(
    private readonly write: (
      update: ImagePathifySettingsUpdate,
    ) => Promise<ImagePathifyPublicSettings>,
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
  }

  /** Hide the card while the Remote is down. */
  markUnavailable(): void {
    this.available = false;
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
    const prefix = this.prefixDraft ?? this.stored.prefix;
    const relax = this.relaxDraft ?? this.stored.relaxAdmission;
    const models = this.modelsDraft ?? this.stored.models;
    const resolvedModel = this.effectiveModel(visionModel);
    const resolvedUrl = this.effectiveUrl(visionBaseUrl);
    return {
      available: this.available,
      writable: true,
      dirty: this.isDirty(),
      invalid: false,
      saving: this.saving,
      failed: this.failed,
      apiKeyText: this.apiKeyDraft ?? "",
      apiKeySet: this.stored.apiKeySet,
      visionModel: {
        text: visionModel,
        overridden: resolvedModel !== DEFAULT_VISION_MODEL,
      },
      visionBaseUrl: {
        text: visionBaseUrl,
        overridden: resolvedUrl !== DEFAULT_VISION_BASE_URL,
      },
      prefix: {
        text: prefix,
        overridden: prefix !== DEFAULT_PREFIX,
      },
      relaxAdmission: {
        checked: relax,
        overridden: relax !== DEFAULTS.relaxAdmission,
      },
      models: {
        entries: models,
        overridden: !modelsEqual(models, DEFAULTS.models),
      },
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
    if (
      this.prefixDraft !== undefined &&
      this.prefixDraft !== this.stored.prefix
    ) {
      return true;
    }
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

  private edit(field: string, text: string): void {
    this.failed = false;
    if (field === "apiKey") {
      this.apiKeyDraft = text;
    } else if (field === "visionModel") {
      this.visionModelDraft = text;
    } else if (field === "visionBaseUrl") {
      this.visionBaseUrlDraft = text;
    } else if (field === "prefix") {
      this.prefixDraft = text;
    }
    this.publish();
  }

  private resetField(field: string): void {
    this.failed = false;
    if (field === "visionModel") this.visionModelDraft = DEFAULT_VISION_MODEL;
    else if (field === "visionBaseUrl") {
      this.visionBaseUrlDraft = DEFAULT_VISION_BASE_URL;
    } else if (field === "prefix") this.prefixDraft = DEFAULT_PREFIX;
    else if (field === "relaxAdmission") {
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
    this.prefixDraft = undefined;
    this.relaxDraft = undefined;
    this.modelsDraft = undefined;
    this.failed = false;
    this.publish();
  }

  private plan(): ImagePathifySettingsUpdate | undefined {
    const update: {
      apiKey?: string;
      visionModel?: string;
      visionBaseUrl?: string;
      prefix?: string;
      relaxAdmission?: boolean;
      models?: PathifyModelEntry[];
    } = {};
    let dirty = false;
    if (this.apiKeyDraft !== undefined && this.apiKeyDraft.trim() !== "") {
      update.apiKey = this.apiKeyDraft;
      dirty = true;
    }
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
    const prefix = this.prefixDraft ?? this.stored.prefix;
    if (prefix !== this.stored.prefix) {
      update.prefix = prefix;
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
    const update = this.plan();
    if (update === undefined || this.saving) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      const next = await this.write(update);
      this.stored = next;
      this.apiKeyDraft = undefined;
      this.visionModelDraft = undefined;
      this.visionBaseUrlDraft = undefined;
      this.prefixDraft = undefined;
      this.relaxDraft = undefined;
      this.modelsDraft = undefined;
    } catch {
      this.failed = true;
    } finally {
      this.saving = false;
      this.publish();
    }
  }

  private publish(): void {
    this.store.set(this.projection());
  }
}
