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
    configForms: {
      get(entryId: string): {
        getSnapshot(): {
          status: "loading" | "ready" | "unavailable";
          value?: Record<string, unknown>;
          revision: number;
          writable: boolean;
        };
        subscribe(listener: () => void): () => void;
        mutate(
          ops: readonly {
            op: "set";
            path: readonly string[];
            value: unknown;
          }[],
          revision: number,
        ): Promise<boolean>;
      };
      whileServed(
        namespaces: readonly string[],
        register: () => unknown,
      ): () => void;
    };
    reflect?: { get(name: string): unknown };
  }
}

declare module "@deepseek-ai/dsh-client-ui-plugin-manager/client" {}

declare module "@deepseek-ai/dsh-client-locale/client" {}
declare module "@deepseek-ai/dsh-client-ui-settings/client" {}
declare module "@deepseek-ai/dsh-api-remotes/client" {}
declare module "@deepseek-ai/dsh-client-ui-slots" {
  export interface LocaleNamespaceMap {}
}
