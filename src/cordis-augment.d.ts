import "@deepseek-ai/cordis";
import type {
  SettingsNamespace,
  SettingsScope,
} from "@deepseek-ai/dsh-settings";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry/types";
import type { PreToolDecision, ToolExecution } from "@deepseek-ai/dsh-tools";

declare module "@deepseek-ai/cordis" {
  interface Context {
    tools: {
      register(definition: unknown): () => void;
    };
    settings: {
      register<T>(
        ns: SettingsNamespace,
        schema: unknown,
        options?: { base?: Partial<T>; applies?: "live" | "restart" },
      ): SettingsScope<T>;
      get(ns: SettingsNamespace): SettingsScope<unknown> | undefined;
    };
    credentials?: {
      resolve(
        ref: string,
      ): Promise<{ value: string; source?: string } | undefined>;
    };
    typert: {
      register(contribution: TypertContribution): () => void | Promise<void>;
    };
    systemPrompt: {
      section(section: {
        name: string;
        order: number;
        text: string | (() => string);
      }): () => void;
    };
  }
  interface Events {
    "tools/pre-execute"(
      exec: ToolExecution,
      next: () => Promise<PreToolDecision>,
    ): Promise<PreToolDecision> | PreToolDecision;
    "system-prompt/assemble"(
      assembly: {
        sections: { name: string }[];
        tools: { name: string }[];
      },
      context: {
        agent?: ToolExecution["agent"];
        signal?: AbortSignal;
      },
      next: () => Promise<{
        sections: { name: string }[];
        tools: { name: string }[];
      }>,
    ): Promise<{
      sections: { name: string }[];
      tools: { name: string }[];
    }>;
  }
}
