import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectImageSources,
  resolveImageSources,
  resolveWorkingDirectory,
} from "../src/tool.ts";

describe("collectImageSources", () => {
  it("reads a single image string", () => {
    expect(collectImageSources({ image: " /tmp/a.png " })).toEqual([
      "/tmp/a.png",
    ]);
  });

  it("reads the images array", () => {
    expect(
      collectImageSources({
        images: ["/tmp/a.png", "https://cdn.example/b.png"],
      }),
    ).toEqual(["/tmp/a.png", "https://cdn.example/b.png"]);
  });

  it("accepts an array dumped into image", () => {
    expect(
      collectImageSources({ image: ["/tmp/a.png", "/tmp/b.png"] }),
    ).toEqual(["/tmp/a.png", "/tmp/b.png"]);
  });

  it("dedupes and drops empty entries", () => {
    expect(
      collectImageSources({
        image: "/tmp/a.png",
        images: ["", "/tmp/a.png", " /tmp/b.png "],
      }),
    ).toEqual(["/tmp/a.png", "/tmp/b.png"]);
  });

  it("is empty when nothing usable is passed", () => {
    expect(collectImageSources({})).toEqual([]);
    expect(collectImageSources({ image: "  ", images: [""] })).toEqual([]);
  });
});

describe("resolveImageSources", () => {
  it("normalizes file URLs and resolves relative local paths", () => {
    const cwd = join(tmpdir(), "work");
    const absolute = join(tmpdir(), "absolute.png");
    const file = join(tmpdir(), "file-url.png");
    expect(
      resolveImageSources(
        ["img/a.png", absolute, "https://cdn.example/b.png", pathToFileURL(file).href],
        cwd,
      ),
    ).toEqual([
      resolve(cwd, "img/a.png"),
      absolute,
      "https://cdn.example/b.png",
      file,
    ]);
  });

  it("keeps relative paths when no Session directory exists", () => {
    expect(resolveImageSources(["img/a.png"])).toEqual(["img/a.png"]);
  });
});

describe("resolveWorkingDirectory", () => {
  it("uses the mounted working-directory service", async () => {
    const ctx = {
      get: (name: string) =>
        name === "workingDirectory"
          ? { ensure: async () => join(tmpdir(), "session") }
          : undefined,
    } as never;
    const controller = new AbortController();
    await expect(
      resolveWorkingDirectory(ctx, {
        agent: {},
        signal: controller.signal,
      }),
    ).resolves.toBe(join(tmpdir(), "session"));
  });

  it("returns undefined without an Agent or service", async () => {
    const controller = new AbortController();
    await expect(
      resolveWorkingDirectory({ get: () => undefined } as never, {
        signal: controller.signal,
      }),
    ).resolves.toBeUndefined();
  });
});
