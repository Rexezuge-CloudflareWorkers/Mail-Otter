import { escapeHtml, sanitizeHtml } from './email-content/HtmlContentUtil';
import { stripHtml, normalizeText, truncate, isFromMailbox } from './email-content/TextContentUtil';
import { toCrlf, buildAlternativeMimeBody, extractTextFromRaw } from './email-content/MimeContentUtil';
import { extractGmailText, findGmailPart, decodeBase64Url } from './email-content/GmailContentUtil';
import type { ExtractedEmailContent, GmailMessagePart } from './email-content/GmailContentUtil';

interface MailHeader {
  name: string;
  value: string;
}

class EmailContentUtil {
  public static getHeader(headers: MailHeader[] | undefined, name: string): string | undefined {
    const lowerName = name.toLowerCase();
    return headers?.find((header: MailHeader): boolean => header.name.toLowerCase() === lowerName)?.value;
  }

  public static extractGmailText(payload: GmailMessagePart | undefined): ExtractedEmailContent {
    return extractGmailText(payload);
  }

  public static stripHtml(value: string): string {
    return stripHtml(value);
  }

  public static sanitizeHtml(value: string): string {
    return sanitizeHtml(value);
  }

  public static buildAlternativeMimeBody(textBody: string, htmlBody: string, boundary: string): string {
    return buildAlternativeMimeBody(textBody, htmlBody, boundary);
  }

  public static normalizeText(value: string): string {
    return normalizeText(value);
  }

  public static truncate(value: string, maxChars: number): string {
    return truncate(value, maxChars);
  }

  public static isFromMailbox(
    fromHeaderOrAddress: string | undefined | null,
    mailboxAddress: string | undefined | null,
  ): boolean {
    return isFromMailbox(fromHeaderOrAddress, mailboxAddress);
  }

  public static extractTextFromRaw(raw: string): string {
    return extractTextFromRaw(raw);
  }

  public static toCrlf(value: string): string {
    return toCrlf(value);
  }

  public static decodeBase64Url(value: string): string {
    return decodeBase64Url(value);
  }

  public static findGmailPart(part: GmailMessagePart | undefined, mimeType: string): string | undefined {
    return findGmailPart(part, mimeType);
  }

  public static escapeHtml(value: string): string {
    return escapeHtml(value);
  }
}

export { EmailContentUtil };
export type {   MailHeader };

export {type ExtractedEmailContent, type GmailMessagePart} from './email-content/GmailContentUtil';