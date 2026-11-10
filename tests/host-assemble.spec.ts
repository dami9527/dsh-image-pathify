import { Context } from "@deepseek-ai/cordis";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { describe, expect, it } from "vitest";
import {
  ANALYZE_IMAGE_TOOL,
  READ_IMAGE_TOOL,
  VISION_PROMPT_NAME,
  assembleVisionPolicy,
  visionPromptText,
} from "../src/policy.ts";

/**
 * Contract test against the real host `SystemPrompt.assemble()`.
 *
 * dsh 0.2.2 turned the `system-prompt/assemble` payload into `PromptPresentation`
 * (`sections`/`contexts`/`variables`) and appends the provider-owned tools after
 * the waterfall. A plugin that reads `assembly.tools` there throws
 * `Cannot read properties of undefined (reading 'filter')` and kills the whole
 * turn, so this suite drives the shipped implementation instead of a fixture.
 */
function makeHost(): { ctx: Context; prompt: SystemPrompt } {
  const ctx = new Context();
  const prompt = new SystemPrompt(ctx, {});
  prompt.section({
    name: VISION_PROMPT_NAME,
    order: 118,
    text: () => visionPromptText(),
  });
  prompt.section({ name: "persona", order: 0, text: "base persona" });
  prompt.tools(() => ({
    schemas: [ANALYZE_IMAGE_TOOL, READ_IMAGE_TOOL, "bash"].map((name) => ({
      name,
      description: `${name} tool`,
      parameters: { type: "object", properties: {} },
    })),
  }));
  return { ctx, prompt };
}

/**
 * `AssembleContext` fields the agent loop adds at runtime (dsh 0.2.2): the
 * calling agent and the exact step selection. They are declared by
 * `@deepseek-ai/dsh-agent`, which this plugin does not depend on, so the test
 * describes only the shape it drives.
 */
interface StepContext {
  agent?: unknown;
  modelSelection?: { provider: string; model: string };
}

function assemble(
  prompt: SystemPrompt,
  step: StepContext = {},
): ReturnType<SystemPrompt["assemble"]> {
  return prompt.assemble(step as never);
}

/** Tool names in declaration order, ignoring the host's own ordering rules. */
function toolNames(assembly: { tools: readonly { name: string }[] }): string[] {
  return assembly.tools.map((tool) => tool.name);
}

function sectionNames(assembly: {
  sections: readonly { name: string }[];
}): string[] {
  return assembly.sections.map((section) => section.name);
}

function listen(ctx: Context): void {
  ctx.on("system-prompt/assemble", (assembly, context, next) =>
    assembleVisionPolicy(ctx, assembly, context, next),
  );
}

describe("host system-prompt assembly", () => {
  it("assembles the vision section and the provider-owned tools", async () => {
    const { prompt } = makeHost();
    const assembly = await assemble(prompt);
    expect(sectionNames(assembly)).toContain(VISION_PROMPT_NAME);
    expect(toolNames(assembly).sort()).toEqual(
      [READ_IMAGE_TOOL, ANALYZE_IMAGE_TOOL, "bash"].sort(),
    );
  });

  it("keeps the vision section on a text-only step and cannot touch tools", async () => {
    const { ctx, prompt } = makeHost();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    listen(ctx);
    const assembly = await assemble(prompt, {
      modelSelection: { provider: "p", model: "text-only" },
    });
    // Declarations stay provider-owned; `llm/stream` is what hides read_image.
    expect(sectionNames(assembly)).toContain(VISION_PROMPT_NAME);
    expect(toolNames(assembly)).toContain(READ_IMAGE_TOOL);
  });

  it("strips the vision section for a vision step", async () => {
    const { ctx, prompt } = makeHost();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["image"] }),
    });
    listen(ctx);
    const assembly = await assemble(prompt, {
      modelSelection: { provider: "p", model: "vision" },
    });
    expect(sectionNames(assembly)).not.toContain(VISION_PROMPT_NAME);
    expect(sectionNames(assembly)).toContain("persona");
  });

  it("still strips the section when only a request header names the route", async () => {
    const { ctx, prompt } = makeHost();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["image"] }),
    });
    listen(ctx);
    const assembly = await assemble(prompt, {
      agent: {
        session: {
          requestHeader: () => ({ config: { provider: "p", model: "vision" } }),
        },
      } as never,
    });
    expect(sectionNames(assembly)).not.toContain(VISION_PROMPT_NAME);
  });
});
