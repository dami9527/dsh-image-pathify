import "@deepseek-ai/cordis";
// Side-effect import: merges the real `systemPrompt` service and the
// `system-prompt/assemble` event (`PromptPresentation`, tools are provider-owned
// since dsh 0.2.2) into the program, so this plugin type-checks against the
// harness contract instead of a hand-written copy of it.
import "@deepseek-ai/dsh-system-prompt";
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
  }
  interface Events {
    "loader/volatile-update"(paths: readonly (readonly string[])[]): void;
    "tools/pre-execute"(
      exec: ToolExecution,
      next: () => Promise<PreToolDecision>,
    ): Promise<PreToolDecision> | PreToolDecision;
  }
}
