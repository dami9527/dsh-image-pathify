/**
 * Host Remote service (`ctx.imagePathify`, wire namespace `imagePathify`).
 * Mounted as a Cordis service; the Gateway resolves methods from the strict
 * Typert manifest rather than `@Remote` decorator state. The `typertRemote`
 * field is still required: `typert gateway` refuses dispatch when the live
 * service has no visible binding, even with a registered manifest.
 * @module dsh-image-pathify/runtime
 */

import { Service, type Context } from "@deepseek-ai/cordis";
import type {
  ImagePathifyPublicSettings,
  ImagePathifySettingsUpdate,
  ImagePathifyUpdateStatus,
} from "./contract.ts";

/** Same shape `bindTypertRemote` freezes; kept local so this module does not import `dsh-typert-protocol`. */
export interface ImagePathifyTypertBinding {
  readonly service: object;
  readonly serviceKey: string;
  readonly namespace: string;
}

/** Settings Remote: read the public section and persist one UI patch. */
export class ImagePathifyRuntime extends Service {
  /** Visible binding consumed by the Host Gateway's source-mode discovery. */
  readonly typertRemote: ImagePathifyTypertBinding;

  constructor(
    ctx: Context,
    private readonly readSettings: () => ImagePathifyPublicSettings,
    private readonly writeSettings: (
      update: ImagePathifySettingsUpdate,
    ) => Promise<ImagePathifyPublicSettings>,
    private readonly readUpdate: () => Promise<ImagePathifyUpdateStatus>,
  ) {
    super(ctx, "imagePathify");
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: this.name,
      namespace: this.name,
    });
  }

  /** Read the resolved durable settings through the plugin-owned wire. */
  getSettings(): ImagePathifyPublicSettings {
    return this.readSettings();
  }

  /** Persist one settings patch and return the public section. */
  updateSettings(
    update: ImagePathifySettingsUpdate,
  ): Promise<ImagePathifyPublicSettings> {
    return this.writeSettings(update);
  }

  /** Return the cached npm latest-version probe (started at plugin load). */
  getUpdate(): Promise<ImagePathifyUpdateStatus> {
    return this.readUpdate();
  }
}
