/**
 * Parses the model's output protocol as it streams:
 *   line 1        "KIND: script" | "KIND: brief" | "KIND: none"
 *   body          markdown with "## " headings
 *   tail          <<extracted>>{json}<<end>>   (never shown to the client)
 */
export type OutputKind = "script" | "brief" | "none" | "unknown";

const EXTRACTED_OPEN = "<<extracted>>";
const EXTRACTED_CLOSE = "<<end>>";

export function createOutputParser() {
  let headerBuf = "";
  let headerDone = false;
  let kind: OutputKind | null = null;
  let buf = "";
  let inExtracted = false;
  let extractedBuf = "";
  let extracted: unknown = null;
  let lineStart = true;
  const sections: string[] = [];

  function scanSections(text: string): string[] {
    const found: string[] = [];
    for (let i = 0; i < text.length; i++) {
      if (lineStart && text.startsWith("## ", i)) {
        const end = text.indexOf("\n", i);
        if (end === -1) break; // heading not complete yet; caller keeps the tail
        found.push(text.slice(i + 3, end).trim());
      }
      lineStart = text[i] === "\n";
    }
    return found;
  }

  function takeHeader(chunk: string): string {
    headerBuf += chunk;
    const nl = headerBuf.indexOf("\n");
    if (nl === -1) {
      // No newline yet. If the buffer already cannot be a header, give up waiting.
      if (headerBuf.length > 24 && !/^\s*KIND:/i.test(headerBuf)) {
        headerDone = true;
        kind = "unknown";
        const rest = headerBuf;
        headerBuf = "";
        return rest;
      }
      return "";
    }
    const first = headerBuf.slice(0, nl).trim();
    const rest = headerBuf.slice(nl + 1);
    headerDone = true;
    headerBuf = "";
    const m = first.match(/^KIND:\s*(script|brief|none)\b/i);
    if (m) {
      kind = m[1].toLowerCase() as OutputKind;
      return rest;
    }
    kind = "unknown";
    return first + "\n" + rest;
  }

  function splitExtracted(text: string): string {
    // Returns visible text; stores anything inside the extracted block.
    let visible = "";
    let s = text;
    while (s.length) {
      if (inExtracted) {
        const close = s.indexOf(EXTRACTED_CLOSE);
        if (close === -1) {
          extractedBuf += s;
          return visible;
        }
        extractedBuf += s.slice(0, close);
        try {
          extracted = JSON.parse(extractedBuf.trim());
        } catch {
          extracted = null;
        }
        inExtracted = false;
        s = s.slice(close + EXTRACTED_CLOSE.length);
        continue;
      }
      const open = s.indexOf(EXTRACTED_OPEN);
      if (open !== -1) {
        visible += s.slice(0, open);
        inExtracted = true;
        s = s.slice(open + EXTRACTED_OPEN.length);
        continue;
      }
      // Hold back a possible partial "<<extracted>>" prefix at the end.
      let lt = s.lastIndexOf("<<");
      if (lt === -1 || !EXTRACTED_OPEN.startsWith(s.slice(lt))) lt = s.endsWith("<") ? s.length - 1 : -1;
      if (lt !== -1) {
        visible += s.slice(0, lt);
        buf = s.slice(lt);
        return visible;
      }
      visible += s;
      return visible;
    }
    return visible;
  }

  return {
    get kind() {
      return kind;
    },
    get extracted() {
      return extracted;
    },
    push(chunk: string): { visible: string; sections: string[] } {
      let text = headerDone ? chunk : takeHeader(chunk);
      if (!text) return { visible: "", sections: [] };
      text = buf + text;
      buf = "";
      const visible = splitExtracted(text);
      // sections: only complete heading lines; keep an unfinished heading line in `buf`? No: the
      // visible text has already been emitted, so headings are detected on complete lines only.
      const found = scanSections(visible);
      return { visible, sections: found };
    },
    flush(): { visible: string; sections: string[] } {
      let out = "";
      if (!headerDone) {
        headerDone = true;
        const first = headerBuf.trim();
        const m = first.match(/^KIND:\s*(script|brief|none)\b/i);
        kind = m ? (m[1].toLowerCase() as OutputKind) : "unknown";
        out = m ? "" : headerBuf;
        headerBuf = "";
      }
      out += buf; // a held prefix that never became a marker is the model's literal text
      buf = "";
      if (inExtracted && extracted === null) {
        try {
          extracted = JSON.parse(extractedBuf.trim());
        } catch {
          extracted = null;
        }
      }
      const found = scanSections(out);
      return { visible: out, sections: found };
    },
  };
}
