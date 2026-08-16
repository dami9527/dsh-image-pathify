/**
 * Host Typert manifest for the `imagePathify` Remote. Registered through
 * `ctx.typert.register` so the Gateway resolves get/update without consulting
 * the `@Remote` marker table (source-launch can load two protocol copies).
 * @module dsh-image-pathify/typert
 */

import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry/types";
import { IMAGE_PATHIFY_INVOCATIONS } from "./contract.ts";

/** Host contribution claiming the `imagePathify` settings endpoints. */
export const TYPERT_MANIFEST: TypertContribution = {
  package: "dsh-image-pathify",
  face: "host",
  schemas: [],
  model: {
    services: [
      {
        key: "imagePathify",
        exportName: "ImagePathifyRuntime",
        description:
          "Plugin-owned settings for the vision API and image pathify tunables.",
        tags: [],
        members: [
          {
            kind: "method",
            name: "getSettings",
            signature: "getSettings(): ImagePathifyPublicSettings",
          },
          {
            kind: "method",
            name: "updateSettings",
            signature:
              "updateSettings(update: ImagePathifySettingsUpdate): Promise<ImagePathifyPublicSettings>",
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: IMAGE_PATHIFY_INVOCATIONS,
};
