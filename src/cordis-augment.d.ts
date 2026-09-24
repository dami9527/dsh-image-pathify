import "@deepseek-ai/cordis";
import type { PreToolDecision, ToolExecution } from "@deepseek-ai/dsh-tools";

declare module "@deepseek-ai/cordis" {
  interface Context {
    tools: {
      register(definition: unknown): () => void;
    };
    credentials?: {
      resolve(
        ref: string,
      ): Promise<{ value: string; source?: string } | undefined>;
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
    "loader/volatile-update"(paths: readonly (readonly string[])[]): void;
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
