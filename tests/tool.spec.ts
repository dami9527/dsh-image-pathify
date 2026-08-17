import { describe, expect, it } from "vitest";
import { collectImageSources } from "../src/tool.ts";

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
