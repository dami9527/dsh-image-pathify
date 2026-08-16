/**
 * Client-side Typert Remote contribution for the imagePathify host service.
 * @module dsh-image-pathify/client/remote
 */

import type {
  RemoteResult,
  TypertRemoteContribution,
} from "@deepseek-ai/dsh-typert-protocol";
import { IMAGE_PATHIFY_INVOCATIONS } from "../contract.ts";
import type {
  ImagePathifyPublicSettings,
  ImagePathifySettingsUpdate,
} from "../contract.ts";

/** The imagePathify Remote namespace's client contribution. */
export const IMAGE_PATHIFY_REMOTE: TypertRemoteContribution = {
  package: "dsh-image-pathify",
  descriptors: IMAGE_PATHIFY_INVOCATIONS,
};

declare module "@deepseek-ai/dsh-typert-protocol" {
  /** The `imagePathify` namespace face mounted under `ctx.remote.imagePathify`. */
  interface TypertRemoteNamespace$696d61676550617468696679 {
    getSettings: () => Promise<RemoteResult<ImagePathifyPublicSettings>>;
    updateSettings: (
      update: ImagePathifySettingsUpdate,
    ) => Promise<RemoteResult<ImagePathifyPublicSettings>>;
  }
  interface TypertRemoteMap {
    "imagePathify/getSettings": () => Promise<
      RemoteResult<ImagePathifyPublicSettings>
    >;
    "imagePathify/updateSettings": (
      update: ImagePathifySettingsUpdate,
    ) => Promise<RemoteResult<ImagePathifyPublicSettings>>;
  }
  interface TypertRemoteNamespaceMap {
    imagePathify: TypertRemoteNamespace$696d61676550617468696679;
  }
}
