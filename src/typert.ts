/**
 * Host Typert manifest for the `imagePathify` update probe. Settings are the
 * Loader entry, edited through the plugins page, not this Remote.
 * @module dsh-image-pathify/typert
 */

import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry/types";
import { IMAGE_PATHIFY_INVOCATIONS } from "./contract.ts";

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface TypertRegistryContract {
    register(contribution: TypertContribution): () => void | Promise<void>;
  }
}

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
        description: "npm latest-version probe for this plugin.",
        tags: [],
        members: [
          {
            kind: "method",
            name: "getUpdate",
            signature: "getUpdate(): Promise<ImagePathifyUpdateStatus>",
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
