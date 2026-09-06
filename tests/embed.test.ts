import { describe, expect, it } from "vitest";
// Read through Vite's ?raw import, the same way the embed.js and embed.css endpoints do, so the
// test needs no Node types and sees exactly the bytes the app serves.
import js from "../src/client/embed.js?raw";
import css from "../src/client/embed.css?raw";
import sheet from "../docs/designer-page-build-sheet.md?raw";

describe("embed", () => {
  it("parses as a classic script", () => {
    expect(() => new Function(js)).not.toThrow();
  });

  it("carries no em or en dashes in anything a client or the owner reads", () => {
    for (const [name, s] of [["embed.js", js], ["embed.css", css], ["build sheet", sheet]]) {
      expect(s.includes("—"), `${name} has an em dash`).toBe(false);
      expect(s.includes("–"), `${name} has an en dash`).toBe(false);
    }
  });

  it("only looks for ids the build sheet tells the Designer to create", () => {
    const block = js.match(/var ID = \{([\s\S]*?)\};/)?.[1] ?? "";
    const ids = [...block.matchAll(/"(fdf-[a-z-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(19);
    for (const id of ids) expect(sheet, `build sheet does not mention ${id}`).toContain("`" + id + "`");
  });

  it("derives the app path from its own script tag and never hard-codes the mount", () => {
    expect(js).toContain("document.currentScript");
    expect(js).toContain('base + "/api/analyse"');
    expect(js).not.toContain('"/analyser/api');
  });

  it("stops Webflow's own form handler", () => {
    expect(js).toContain("stopImmediatePropagation");
    expect(js).toMatch(/addEventListener\("submit",[\s\S]*?, true\)/);
  });
});
