import { convert } from 'html-to-text';

interface ExtractedEmailContent {
  text: string;
  usedHtmlFallback: boolean;
}

interface MailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string | undefined;
  filename?: string | undefined;
  headers?: MailHeader[] | undefined;
  body?: { data?: string | undefined } | undefined;
  parts?: GmailMessagePart[] | undefined;
}

class EmailContentUtil {
  public static getHeader(headers: MailHeader[] | undefined, name: string): string | undefined {
    const lowerName = name.toLowerCase();
    return headers?.find((header: MailHeader): boolean => header.name.toLowerCase() === lowerName)?.value;
  }

  public static extractGmailText(payload: GmailMessagePart | undefined): ExtractedEmailContent {
    const textPlain: string | undefined = EmailContentUtil.findGmailPart(payload, 'text/plain');
    if (textPlain) return { text: EmailContentUtil.normalizeText(textPlain), usedHtmlFallback: false };
    const html: string | undefined = EmailContentUtil.findGmailPart(payload, 'text/html');
    return { text: EmailContentUtil.normalizeText(EmailContentUtil.stripHtml(html || '')), usedHtmlFallback: true };
  }

  public static stripHtml(value: string): string {
    return convert(value, {
      wordwrap: false,
      selectors: [
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'br', format: 'lineBreak' },
        { selector: 'p', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },
      ],
    });
  }

  public static renderPlainTextAsHtml(value: string): string {
    const escaped: string = EmailContentUtil.escapeHtml(value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')).replace(/\n/g, '<br>\n');
    return [
      '<!doctype html>',
      '<html>',
      '<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.5;color:#111827;">',
      `<div style="font-size:14px;">${escaped}</div>`,
      '</body>',
      '</html>',
    ].join('\n');
  }

  public static buildAlternativeMimeBody(textBody: string, htmlBody: string, boundary: string): string {
    return [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      EmailContentUtil.toCrlf(textBody),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      EmailContentUtil.toCrlf(htmlBody),
      `--${boundary}--`,
      '',
    ].join('\r\n');
  }

  public static normalizeText(value: string): string {
    return value
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  public static truncate(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}\n\n[Message truncated before summarization.]`;
  }

  public static isFromMailbox(fromHeaderOrAddress: string | undefined | null, mailboxAddress: string | undefined | null): boolean {
    if (!fromHeaderOrAddress || !mailboxAddress) return false;
    return fromHeaderOrAddress.toLowerCase().includes(mailboxAddress.toLowerCase());
  }

  private static toCrlf(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
  }

  private static escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char: string): string => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }

  private static findGmailPart(part: GmailMessagePart | undefined, mimeType: string): string | undefined {
    if (!part) return undefined;
    if (part.mimeType === mimeType && part.body?.data && !part.filename) {
      return EmailContentUtil.decodeBase64Url(part.body.data);
    }
    for (const child of part.parts || []) {
      const value: string | undefined = EmailContentUtil.findGmailPart(child, mimeType);
      if (value) return value;
    }
    return undefined;
  }

  private static decodeBase64Url(value: string): string {
    const normalized: string = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded: string = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary: string = atob(padded);
    const bytes: Uint8Array = Uint8Array.from(binary, (char: string): number => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
}

export { EmailContentUtil };
export type { ExtractedEmailContent, GmailMessagePart, MailHeader };
