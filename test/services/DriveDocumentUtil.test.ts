import { describe, expect, it } from 'vitest';

import { DriveDocumentUtil } from '@mail-otter/backend-services/drive/DriveDocumentUtil';

function encode(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

function pdf(content: string): ArrayBuffer {
  return encode(`%PDF-1.4\nstream\n${content}\nendstream`);
}

describe('DriveDocumentUtil', () => {
  describe('extractText', () => {
    it('decodes plain text', () => {
      expect(DriveDocumentUtil.extractText(encode('hello world'), 'text/plain')).toBe('hello world');
    });

    it('decodes markdown', () => {
      expect(DriveDocumentUtil.extractText(encode('# Title\nBody'), 'text/markdown')).toBe('# Title\nBody');
    });

    it('decodes csv', () => {
      expect(DriveDocumentUtil.extractText(encode('a,b,c'), 'text/csv')).toBe('a,b,c');
    });

    it('returns null for whitespace-only text', () => {
      expect(DriveDocumentUtil.extractText(encode('   '), 'text/plain')).toBeNull();
    });

    it('strips MIME type parameters', () => {
      expect(DriveDocumentUtil.extractText(encode('hi'), 'text/plain; charset=utf-8')).toBe('hi');
    });

    it('returns null for unsupported MIME type', () => {
      expect(DriveDocumentUtil.extractText(encode('data'), 'application/octet-stream')).toBeNull();
    });

    it('delegates application/pdf to PDF extractor', () => {
      const result = DriveDocumentUtil.extractText(pdf('(Hello) Tj'), 'application/pdf');
      expect(result).toBe('Hello');
    });
  });

  describe('extractText — PDF Tj operator', () => {
    it('extracts a single Tj string', () => {
      expect(DriveDocumentUtil.extractText(pdf('(Hello World) Tj'), 'application/pdf')).toBe('Hello World');
    });

    it('handles no whitespace between string and operator', () => {
      expect(DriveDocumentUtil.extractText(pdf('(Tight)Tj'), 'application/pdf')).toBe('Tight');
    });

    it('handles multiple spaces before Tj', () => {
      expect(DriveDocumentUtil.extractText(pdf('(Spaced)   Tj'), 'application/pdf')).toBe('Spaced');
    });

    it('extracts multiple Tj strings', () => {
      expect(DriveDocumentUtil.extractText(pdf('(Foo) Tj\n(Bar) Tj'), 'application/pdf')).toBe('Foo Bar');
    });

    it('ignores strings not followed by Tj', () => {
      expect(DriveDocumentUtil.extractText(pdf('(Ignored) Tm\n(Kept) Tj'), 'application/pdf')).toBe('Kept');
    });

    it('returns null when no Tj strings found', () => {
      expect(DriveDocumentUtil.extractText(pdf('BT ET'), 'application/pdf')).toBeNull();
    });
  });

  describe('extractText — PDF TJ operator (array)', () => {
    it('extracts strings from a TJ array', () => {
      expect(DriveDocumentUtil.extractText(pdf('[(Hello) -200 (World)] TJ'), 'application/pdf')).toBe('Hello World');
    });

    it('extracts TJ array with no spacing numbers', () => {
      expect(DriveDocumentUtil.extractText(pdf('[(Only)] TJ'), 'application/pdf')).toBe('Only');
    });

    it('handles mixed Tj and TJ operators', () => {
      const result = DriveDocumentUtil.extractText(pdf('(First) Tj\n[(Second) 0 (Third)] TJ'), 'application/pdf');
      expect(result).toBe('First Second Third');
    });

    it('ignores TJ arrays not followed by TJ', () => {
      expect(DriveDocumentUtil.extractText(pdf('[(No)] Tm'), 'application/pdf')).toBeNull();
    });
  });

  describe('extractText — PDF escape sequences', () => {
    it('unescapes \\n in string', () => {
      expect(DriveDocumentUtil.extractText(pdf('(line1\\nline2) Tj'), 'application/pdf')).toBe('line1\nline2');
    });

    it('unescapes \\t in string', () => {
      expect(DriveDocumentUtil.extractText(pdf('(col1\\tcol2) Tj'), 'application/pdf')).toBe('col1\tcol2');
    });

    it('unescapes \\\\ to single backslash', () => {
      expect(DriveDocumentUtil.extractText(pdf('(back\\\\slash) Tj'), 'application/pdf')).toBe('back\\slash');
    });

    it('unescapes escaped parentheses', () => {
      expect(DriveDocumentUtil.extractText(pdf('(a\\(b\\)c) Tj'), 'application/pdf')).toBe('a(b)c');
    });

    it('handles balanced nested parentheses in string', () => {
      expect(DriveDocumentUtil.extractText(pdf('(outer (inner) outer) Tj'), 'application/pdf')).toBe('outer (inner) outer');
    });
  });

  describe('extractText — PDF adversarial / edge cases', () => {
    it('returns null for empty ArrayBuffer', () => {
      expect(DriveDocumentUtil.extractText(new ArrayBuffer(0), 'application/pdf')).toBeNull();
    });

    it('handles unclosed string gracefully', () => {
      expect(DriveDocumentUtil.extractText(pdf('(unclosed'), 'application/pdf')).toBeNull();
    });

    it('handles unclosed array gracefully', () => {
      expect(DriveDocumentUtil.extractText(pdf('[(unclosed)'), 'application/pdf')).toBeNull();
    });

    it('completes in O(n) time on adversarial input with no Tj operators', () => {
      // 200k repetitions of ") " — crafted to trigger regex backtracking in the old approach
      const adversarial = ') '.repeat(200_000);
      const start = Date.now();
      DriveDocumentUtil.extractText(encode(adversarial), 'application/pdf');
      const elapsed = Date.now() - start;
      // Linear scan should finish well under 500ms even for 400KB input
      expect(elapsed).toBeLessThan(500);
    });

    it('skips whitespace-only extracted strings', () => {
      expect(DriveDocumentUtil.extractText(pdf('(   ) Tj'), 'application/pdf')).toBeNull();
    });

    it('does not confuse Tjx token as Tj operator', () => {
      // "Tjx" is not a valid PDF operator; string should not be captured
      expect(DriveDocumentUtil.extractText(pdf('(Wrong) Tjx'), 'application/pdf')).toBeNull();
    });

    it('does not confuse TJx token as TJ operator', () => {
      expect(DriveDocumentUtil.extractText(pdf('[(Wrong)] TJx'), 'application/pdf')).toBeNull();
    });
  });

  describe('buildIndexedText', () => {
    it('builds text with filename and mailbox header', () => {
      const result = DriveDocumentUtil.buildIndexedText('doc.txt', 'work@example.com', 'body content', 1000);
      expect(result).toBe('File: doc.txt\nMailbox: work@example.com\n\nbody content');
    });

    it('truncates to maxChars', () => {
      const result = DriveDocumentUtil.buildIndexedText('f', 'm', 'body', 10);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('does not truncate when within limit', () => {
      const result = DriveDocumentUtil.buildIndexedText('f', 'm', 'hi', 10_000);
      expect(result).toContain('hi');
    });
  });

  describe('truncateToMaxChars', () => {
    it('returns text unchanged when within limit', () => {
      expect(DriveDocumentUtil.truncateToMaxChars('hello', 10)).toBe('hello');
    });

    it('truncates when over limit', () => {
      expect(DriveDocumentUtil.truncateToMaxChars('hello world', 5)).toBe('hello');
    });

    it('returns exact text when equal to limit', () => {
      expect(DriveDocumentUtil.truncateToMaxChars('hello', 5)).toBe('hello');
    });
  });
});
