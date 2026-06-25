import { normalizeText, stripHtml } from './TextContentUtil';

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}

interface ExtractedEmailContent {
  text: string;
  usedHtmlFallback: boolean;
}

function decodeBase64Url(value: string): string {
  const normalized: string = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded: string = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary: string = atob(padded);
  const bytes: Uint8Array = Uint8Array.from(binary, (char: string): number => char.codePointAt(0) ?? 0);
  return new TextDecoder().decode(bytes);
}

function findGmailPart(part: GmailMessagePart | undefined, mimeType: string): string | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data && !part.filename) {
    return decodeBase64Url(part.body.data);
  }
  const parts = part.parts ?? [];
  for (const child of parts) {
    const value: string | undefined = findGmailPart(child, mimeType);
    if (value) return value;
  }
  return undefined;
}

function extractGmailText(payload: GmailMessagePart | undefined): ExtractedEmailContent {
  const textPlain: string | undefined = findGmailPart(payload, 'text/plain');
  if (textPlain) return { text: normalizeText(textPlain), usedHtmlFallback: false };
  const html: string | undefined = findGmailPart(payload, 'text/html');
  return { text: normalizeText(stripHtml(html || '')), usedHtmlFallback: true };
}

export type { ExtractedEmailContent, GmailMessagePart };
export { decodeBase64Url, findGmailPart, extractGmailText };
