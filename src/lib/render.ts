/**
 * Streaming markdown-subset to HTML. Input text must already be HTML-escaped except for the
 * <a> anchors the ref rewriter produced. Supports "## " headings, "- " bullets, paragraphs,
 * **bold**. Nothing else, on purpose.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

type Block = "none" | "p" | "h2" | "li";

export function createHtmlRenderer() {
  let block: Block = "none";
  let inList = false;
  let bold = false;
  let pendingStar = false;
  let atLineStart = true;
  let lineBuf = ""; // first characters of a line, until we know what kind of line it is

  function emitChar(ch: string): string {
    if (ch === "*") {
      if (pendingStar) {
        pendingStar = false;
        bold = !bold;
        return bold ? "<strong>" : "</strong>";
      }
      pendingStar = true;
      return "";
    }
    let out = "";
    if (pendingStar) {
      out += "*";
      pendingStar = false;
    }
    return out + ch;
  }

  function closeBlock(): string {
    let out = "";
    if (pendingStar) {
      out += "*";
      pendingStar = false;
    }
    if (bold) {
      out += "</strong>";
      bold = false;
    }
    if (block === "p") out += "</p>";
    else if (block === "h2") out += "</h2>";
    else if (block === "li") out += "</li>";
    block = "none";
    return out;
  }

  function closeList(): string {
    if (!inList) return "";
    inList = false;
    return "</ul>";
  }

  function openFor(prefix: string): string {
    let out = "";
    let rest = prefix;
    if (prefix.startsWith("## ")) {
      out += closeBlock() + closeList();
      block = "h2";
      out += "<h2>";
      rest = prefix.slice(3);
    } else if (/^[-*] /.test(prefix)) {
      out += closeBlock();
      if (!inList) {
        inList = true;
        out += "<ul>";
      }
      block = "li";
      out += "<li>";
      rest = prefix.slice(2);
    } else if (block !== "p") {
      out += closeBlock() + closeList();
      block = "p";
      out += "<p>";
    } else {
      out += " ";
    }
    for (const ch of rest) out += emitChar(ch);
    return out;
  }

  return {
    push(chunk: string): string {
      let out = "";
      for (const ch of chunk) {
        if (ch === "\n") {
          if (atLineStart) {
            // a blank line ends the paragraph or the list
            if (lineBuf.trim()) out += openFor(lineBuf);
            lineBuf = "";
            out += closeBlock() + closeList();
            continue;
          }
          if (block === "h2" || block === "li") out += closeBlock();
          atLineStart = true;
          continue;
        }
        if (atLineStart) {
          lineBuf += ch;
          const decided = lineBuf.length >= 3 || !/^[#\-* ]*$/.test(lineBuf);
          if (!decided) continue;
          if (lineBuf.trim() === "") {
            lineBuf = "";
            continue;
          }
          out += openFor(lineBuf);
          lineBuf = "";
          atLineStart = false;
          continue;
        }
        out += emitChar(ch);
      }
      return out;
    },
    flush(): string {
      let out = "";
      if (lineBuf.trim()) out += openFor(lineBuf);
      lineBuf = "";
      out += closeBlock() + closeList();
      return out;
    },
  };
}
