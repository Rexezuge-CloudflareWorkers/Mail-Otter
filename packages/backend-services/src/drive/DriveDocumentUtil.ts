const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv']);

// PDF whitespace characters (spec §7.2.2) and delimiter characters (spec §7.2.3).
const PDF_WS = new Set([' ', '\t', '\n', '\r', '\f', '\0']);
const PDF_DELIMS = new Set([
  ' ', '\t', '\n', '\r', '\f', '\0',
  '(', ')', '[', ']', '{', '}', '/', '%',
]);

function unescapePdfString(s: string): string {
  return s
    .replaceAll(String.raw`\n`, '\n')
    .replaceAll(String.raw`\r`, '\r')
    .replaceAll(String.raw`\t`, '\t')
    .replaceAll('\\\\', '\\')
    .replaceAll(/\\([)(])/g, '$1');
}

// Reads a PDF literal string starting at index i (the '(' char).
// Balanced nested parens are allowed per the PDF spec.
// Returns [content, index_after_closing_paren], or ['', -1] if unclosed.
function readPdfString(raw: string, i: number): [string, number] {
  const len = raw.length;
  let j = i + 1;
  const start = j;
  let depth = 1;
  while (j < len) {
    const ch = raw[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === '(') { depth++; j++; continue; }
    if (ch === ')') {
      depth--;
      if (depth === 0) return [raw.slice(start, j), j + 1];
      j++;
      continue;
    }
    j++;
  }
  return ['', -1];
}

// Reads a PDF array starting at index i (the '[' char).
// Collects only the literal string items; numbers and whitespace are skipped.
// Returns [string_items, index_after_closing_bracket], or [[], -1] if unclosed.
function readTjArray(raw: string, i: number): [string[], number] {
  const len = raw.length;
  const items: string[] = [];
  let j = i + 1;
  while (j < len) {
    const ch = raw[j];
    if (ch === ']') return [items, j + 1];
    if (ch === '(') {
      const [str, next] = readPdfString(raw, j);
      if (next === -1) return [[], -1];
      items.push(str);
      j = next;
    } else {
      j++;
    }
  }
  return [[], -1];
}

function skipWs(raw: string, len: number, start: number): number {
  let k = start;
  while (k < len && PDF_WS.has(raw[k])) k++;
  return k;
}

function isTj(raw: string, len: number, k: number): boolean {
  return raw[k] === 'T' && raw[k + 1] === 'j' && (k + 2 >= len || PDF_DELIMS.has(raw[k + 2]));
}

function isTJ(raw: string, len: number, k: number): boolean {
  return raw[k] === 'T' && raw[k + 1] === 'J' && (k + 2 >= len || PDF_DELIMS.has(raw[k + 2]));
}

class DriveDocumentUtil {
  public static extractText(data: ArrayBuffer, mimeType: string): string | null {
    const mimeTypeLower = mimeType.toLowerCase().split(';', 1)[0].trim();
    if (TEXT_MIME_TYPES.has(mimeTypeLower)) {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
      return text.trim() || null;
    }
    if (mimeTypeLower === 'application/pdf') {
      return this.extractTextFromPdf(data);
    }
    return null;
  }

  // Best-effort PDF text extraction via Tj/TJ content stream operators.
  // Uses an O(n) character scan — no regex backtracking on uncontrolled input.
  // Works for most standard PDFs; encrypted or glyph-encoded PDFs may yield nothing.
  private static extractTextFromPdf(data: ArrayBuffer): string | null {
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(data);
    const texts: string[] = [];
    const len = raw.length;
    let i = 0;

    while (i < len) {
      const ch = raw[i];
      if (ch === '(') {
        i = this.collectTj(raw, len, i, texts);
      } else if (ch === '[') {
        i = this.collectTjArray(raw, len, i, texts);
      } else {
        i++;
      }
    }

    if (texts.length === 0) return null;
    const combined = texts.join(' ').trim();
    return combined.length > 0 ? combined : null;
  }

  private static collectTj(raw: string, len: number, i: number, texts: string[]): number {
    const [str, next] = readPdfString(raw, i);
    if (next === -1) return i + 1;
    const k = skipWs(raw, len, next);
    if (isTj(raw, len, k)) {
      const s = unescapePdfString(str);
      if (s.trim().length > 0) texts.push(s);
      return k + 2;
    }
    return next;
  }

  private static collectTjArray(raw: string, len: number, i: number, texts: string[]): number {
    const [items, next] = readTjArray(raw, i);
    if (next === -1) return i + 1;
    const k = skipWs(raw, len, next);
    if (isTJ(raw, len, k)) {
      for (const item of items) {
        const s = unescapePdfString(item);
        if (s.trim().length > 0) texts.push(s);
      }
      return k + 2;
    }
    return next;
  }

  public static buildIndexedText(filename: string, appName: string, body: string, maxChars: number): string {
    const text = [`File: ${filename}`, `Mailbox: ${appName}`, '', body].join('\n');
    return this.truncateToMaxChars(text, maxChars);
  }

  public static truncateToMaxChars(text: string, maxChars: number): string {
    return text.length <= maxChars ? text : text.slice(0, maxChars);
  }
}

export { DriveDocumentUtil };
