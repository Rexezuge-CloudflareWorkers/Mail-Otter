import { convert } from 'html-to-text';

function stripHtml(value: string): string {
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

function normalizeText(value: string): string {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    // eslint-disable-next-line sonarjs/super-linear-regex
    .replaceAll(/[ \t]+\n/g, '\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Message truncated before summarization.]`;
}

function isFromMailbox(
  fromHeaderOrAddress: string | undefined | null,
  mailboxAddress: string | undefined | null,
): boolean {
  if (!fromHeaderOrAddress || !mailboxAddress) return false;
  return fromHeaderOrAddress.toLowerCase().includes(mailboxAddress.toLowerCase());
}

export { stripHtml, normalizeText, truncate, isFromMailbox };
