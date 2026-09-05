import { describe, it, expect } from "vitest";
import { createRefRewriter, renderWorkRef, renderDirectorRef } from "../src/lib/refs";

const origin = "https://1stdecember.com";
const nike = { id: "A1", slug: "nike-make-every-yard-count", client: "Nike", campaign: "Make Every Yard Count", year: "2023-06-01" };
const works = new Map([[nike.id, nike]]);
const directors = new Map([["atul-kattukaran", { slug: "atul-kattukaran", name: "Atul Kattukaran" }]]);

describe("citation guardrail: films are rendered from D1 rows only", () => {
  it("renders an id that is in the candidate set from the row, as a link to the work page", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("Closest is [[work:A1]] because of the single take.") + r.flush();
    expect(out).toBe(
      'Closest is <a href="https://1stdecember.com/work/nike-make-every-yard-count">Nike, Make Every Yard Count (2023)</a> because of the single take.',
    );
    expect(r.cited).toEqual(["A1"]);
  });

  it("drops an id that is not in the candidate set, leaving no link, no title and no id", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("See [[work:ZZ9]] for a crowd film.") + r.flush();
    expect(out).not.toContain("ZZ9");
    expect(out).not.toContain("<a");
    expect(out).toBe("See  for a crowd film.");
    expect(r.droppedWorks).toEqual(["ZZ9"]);
    expect(r.cited).toEqual([]);
  });

  it("drops a real catalogue id that was not offered in this request", () => {
    const r = createRefRewriter({ works: new Map(), directors, origin });
    const out = r.push("[[work:A1]]") + r.flush();
    expect(out).not.toContain("Nike");
    expect(out).not.toContain("<a");
    expect(r.droppedWorks).toEqual(["A1"]);
  });

  it("renders a marker that arrives split across stream chunks", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("Try [[wo") + r.push("rk:A1") + r.push("]] here") + r.flush();
    expect(out).toContain('href="https://1stdecember.com/work/nike-make-every-yard-count"');
    expect(out).toMatch(/^Try <a .*<\/a> here$/);
  });

  it("holds back a partial marker at the end of a chunk and never emits it raw", () => {
    const r = createRefRewriter({ works, directors, origin });
    expect(r.push("text [[")).toBe("text ");
    expect(r.push("[")).toBe("");
    expect(r.flush()).toBe("");
  });

  it("holds back a lone opening bracket in case it becomes a marker", () => {
    const r = createRefRewriter({ works, directors, origin });
    expect(r.push("a [")).toBe("a ");
    expect(r.push("b]")).toBe("[b]");
  });

  it("cites each id once even if the model repeats it", () => {
    const r = createRefRewriter({ works, directors, origin });
    r.push("[[work:A1]] and again [[work:A1]]");
    r.flush();
    expect(r.cited).toEqual(["A1"]);
  });
});

describe("director guardrail: only live directors render", () => {
  it("drops a director slug that is not in the live set and renders one that is", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("[[director:shivin-and-sunny]] and [[director:atul-kattukaran]]") + r.flush();
    expect(out).not.toContain("shivin");
    expect(out).toContain('<a href="https://1stdecember.com/director/atul-kattukaran">Atul Kattukaran</a>');
    expect(r.droppedDirectors).toEqual(["shivin-and-sunny"]);
    expect(r.suggestedDirectors).toEqual(["atul-kattukaran"]);
  });
});

describe("rendering", () => {
  it("escapes HTML in row values", () => {
    const w = { id: "B", slug: "x", client: "A&B <Co>", campaign: 'Q "Quote"', year: "2020" };
    expect(renderWorkRef(w, origin)).toBe('<a href="https://1stdecember.com/work/x">A&amp;B &lt;Co&gt;, Q &quot;Quote&quot; (2020)</a>');
  });

  it("omits the year bracket when the row has no year and omits a missing campaign", () => {
    expect(renderWorkRef({ id: "C", slug: "y", client: "Zomato", campaign: null, year: null }, origin)).toBe(
      '<a href="https://1stdecember.com/work/y">Zomato</a>',
    );
  });

  it("renders a director link from the row", () => {
    expect(renderDirectorRef({ slug: "nitin-menon", name: "Nitin Menon" }, origin)).toBe(
      '<a href="https://1stdecember.com/director/nitin-menon">Nitin Menon</a>',
    );
  });
});
