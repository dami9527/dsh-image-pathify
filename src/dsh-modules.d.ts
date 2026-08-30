declare module "@deepseek-ai/dsh-tools" {
  export interface ToolExecution {
    readonly name: string;
    readonly arguments: unknown;
    readonly signal: AbortSignal;
    readonly agent?: {
      session?: {
        requestHeader?: () =>
          { config?: { provider?: string; model?: string } } | undefined;
      };
      options?: { provider?: string; model?: string };
    };
  }

  export type PreToolDecision =
    | { kind: "allow" }
    | { kind: "deny"; reason: string }
    | { kind: "ask"; reason?: string };

  export interface ToolRunContext {
    readonly signal: AbortSignal;
    readonly agent?: ToolExecution["agent"];
  }

  export function defineTool(options: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: {
      schema: unknown;
      render: (
        args: { image: string; prompt?: string },
        value: string,
      ) => unknown[];
    };
    presentCall?: (args: { image: string; prompt?: string }) => unknown;
    execute: (
      args: { image: string; prompt?: string },
      exec: ToolRunContext,
    ) => Promise<unknown> | unknown;
  }): unknown;
}

declare module "@deepseek-ai/dsh-settings" {
  export type SettingsNamespace = string & { readonly __ns: unique symbol };
  export function settingsNamespace(value: string): SettingsNamespace;
  export interface SettingsScope<T> {
    get(): T;
    watch(callback: (next: T, prev: T) => void | Promise<void>): () => void;
    update(patch: Partial<T>): Promise<void>;
  }
}

declare module "@deepseek-ai/dsh-typert-protocol" {
  export interface TypertSchema<Output = unknown> {
    parse(value: unknown): Output;
  }
  export type TypertCodec =
    | {
        readonly mode: "strict";
        readonly typeSymbol: string;
        readonly schema: TypertSchema;
      }
    | { readonly mode: "src-json" };
  export interface InvocationParameterDescriptor {
    readonly name: string;
    readonly wire: string;
    readonly source: "json" | "lookup";
    readonly lookup?: string;
    readonly codec: TypertCodec;
    readonly acceptsUndefined?: true;
  }
  export interface InvocationDescriptor {
    readonly id: string;
    readonly service: string;
    readonly namespace: string;
    readonly method: string;
    readonly invocation: { readonly kind: "direct" };
    readonly parameters: readonly InvocationParameterDescriptor[];
    readonly cancellation?: { readonly parameter: "signal" };
    readonly result: TypertCodec;
  }
  export interface TypertRemoteContribution {
    readonly package: string;
    readonly descriptors: readonly InvocationDescriptor[];
  }
  export type RemoteResult<T> =
    | { readonly ok: true; readonly value: T }
    | {
        readonly ok: false;
        readonly error: {
          readonly code: string;
          readonly message: string;
          readonly details: object;
        };
      };
  export type TypertDisposer = () => Promise<void>;
}

declare module "@deepseek-ai/dsh-typert-registry" {}

declare module "@deepseek-ai/dsh-typert-registry/types" {
  import type { InvocationDescriptor } from "@deepseek-ai/dsh-typert-protocol";
  export type TypertFace = "host" | "client";
  export interface TypertMemberModel {
    readonly kind: string;
    readonly name: string;
    readonly signature: string;
  }
  export interface TypertContribution {
    readonly package: string;
    readonly face: TypertFace;
    readonly schemas: readonly unknown[];
    readonly model: {
      readonly services: readonly {
        readonly key: string;
        readonly exportName: string;
        readonly description: string;
        readonly tags: readonly string[];
        readonly members: readonly TypertMemberModel[];
        readonly types: readonly unknown[];
      }[];
      readonly events: readonly unknown[];
      readonly objects: readonly unknown[];
    };
    readonly invocations: readonly InvocationDescriptor[];
  }
}

declare module "@deepseek-ai/dsh-system-prompt" {}

declare module "@deepseek-ai/dsh-client-runtime/client" {
  export interface ClientContext {
    effect(
      callback: () => void | (() => void) | Promise<void | (() => void)>,
      label?: string,
    ): void;
    on(event: string, listener: (...args: never[]) => void): () => void;
    get(name: string): unknown;
    inject(deps: string[], callback: (ctx: ClientContext) => void): void;
    locale: {
      register(
        ns: string,
        dictionaries: {
          zh: Record<string, string>;
          en: Record<string, string>;
        },
      ): () => void;
      bind(
        ns: string,
      ): (key: string, params?: Record<string, string>) => string;
    };
    remote: {
      $mount(contribution: unknown): Promise<() => void | Promise<void>>;
      $on?(event: string, listener: (...args: never[]) => void): () => void;
    };
    slots: {
      inject(name: string, factory: () => unknown): unknown;
      register(options: Record<string, unknown>, component: unknown): unknown;
    };
    reflect?: { get(name: string): unknown };
  }
}

declare module "@deepseek-ai/dsh-client-locale/client" {}
declare module "@deepseek-ai/dsh-client-ui-settings/client" {}
declare module "@deepseek-ai/dsh-client-ui-settings-plugins/client" {}
declare module "@deepseek-ai/dsh-api-remotes/client" {}
declare module "@deepseek-ai/dsh-client-connection/client" {
  export interface CredentialView {
    configured: boolean;
    source?: string;
    writable: boolean;
  }
  export interface IApiClient {
    credentials: {
      describe(payload: { refs: string[] }): Promise<{
        result:
          | {
              ok: true;
              value: { credentials: Record<string, CredentialView> };
            }
          | { ok: false; error: unknown };
      }>;
      set(payload: { ref: string; value: string }): Promise<{
        result: { ok: true; value: object } | { ok: false; error: unknown };
      }>;
    };
  }
  export interface ConnectionHandle {
    api: IApiClient;
  }
}
declare module "@deepseek-ai/dsh-client-ui-slots" {
  export interface LocaleNamespaceMap {}
}
