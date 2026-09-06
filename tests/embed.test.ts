import { describe, expect, it } from "vitest";
// Read through Vite's ?raw import, the same way the embed.js and embed.css endpoints do, so the
// test needs no Node types and sees exactly the bytes the app serves.
import js from "../src/client/embed.js?raw";
import css from "../src/client/embed.css?raw";
import sheet from "../docs/designer-page-build-sheet.md?raw";
import preview from "../src/pages/admin/preview.astro?raw";

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

  it("has a staff reference page carrying every id, wired to the served files", () => {
    const block = js.match(/var ID = \{([\s\S]*?)\};/)?.[1] ?? "";
    const ids = [...block.matchAll(/"(fdf-[a-z-]+)"/g)].map((m) => m[1]);
    for (const id of ids) expect(preview, `preview.astro lacks id ${id}`).toContain(`id="${id}"`);
    expect(preview).toContain("/embed.js");
    expect(preview).toContain("/embed.css");
    expect(preview).toContain("adminGate(");
  });

  it("derives the app path from its own script tag and never hard-codes the mount", () => {
    expect(js).toContain("document.currentScript");
    expect(js).toContain('base + "/api/analyse"');
    expect(js).not.toContain('"/analyser/api');
  });

  it("resolves the mount from the script src, including a root mount, with data-base as the override", () => {
    // Run the file with a stub document: no elements exist, so it records the base and returns early.
    function baseFor(src: string | null, dataBase?: string): string {
      const script = { src, getAttribute: (n: string) => (n === "data-base" ? dataBase ?? null : null) };
      const win: { console: { warn(): void }; fdfAnalyser?: { base: string } } = { console: { warn() {} } };
      const doc = { currentScript: script, getElementById: () => null };
      new Function("document", "window", js)(doc, win);
      return win.fdfAnalyser!.base;
    }
    expect(baseFor("https://1stdecember.com/analyser/embed.js")).toBe("/analyser");
    expect(baseFor("https://first-december-films.webflow.io/analyser/embed.js?v=2")).toBe("/analyser");
    expect(baseFor("https://fdf-script-staging.webflow.io/embed.js")).toBe("");
    expect(baseFor("http://localhost:4321/embed.js")).toBe("");
    expect(baseFor(null)).toBe("/analyser");
    expect(baseFor("https://1stdecember.com/analyser/embed.js", "/elsewhere/")).toBe("/elsewhere");
  });

  it("stops Webflow's own form handler for the visitor's submit", () => {
    expect(js).toContain("stopImmediatePropagation");
    expect(js).toMatch(/addEventListener\("submit",[\s\S]*?, true\)/);
  });

  it("hands one armed submit to Webflow with the reference and both links, only on a Webflow page", () => {
    expect(js).toContain("nativeArmed = true");
    expect(js).toContain("if (!window.Webflow || !el.form.closest(\".w-form\")) return;");
    for (const f of ["Reference", "Result-Link", "Admin-Link", "Kind"]) expect(js).toContain(`addHidden("${f}"`);
    expect(js).toMatch(/ev === "meta"[\s\S]*?nativeSubmit\(d\.id, d\.kind\)/);
    expect(js).toContain("resetWebflowState();");
  });
});
