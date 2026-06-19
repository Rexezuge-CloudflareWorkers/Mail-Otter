import { describe, expect, it } from 'vitest';
import { EmailContentUtil } from '@mail-otter/provider-clients';
import type { GmailMessagePart } from '@mail-otter/provider-clients';

describe('EmailContentUtil', () => {
  describe('getHeader', () => {
    it('finds header by case-insensitive name', () => {
      const headers = [{ name: 'From', value: 'sender@example.com' }, { name: 'SUBJECT', value: 'Hello' }];
      expect(EmailContentUtil.getHeader(headers, 'from')).toBe('sender@example.com');
      expect(EmailContentUtil.getHeader(headers, 'Subject')).toBe('Hello');
    });

    it('returns undefined for missing header', () => {
      expect(EmailContentUtil.getHeader([{ name: 'To', value: 'me' }], 'From')).toBeUndefined();
    });

    it('returns undefined for undefined headers', () => {
      expect(EmailContentUtil.getHeader(undefined, 'From')).toBeUndefined();
    });
  });

  describe('extractGmailText', () => {
    it('extracts text/plain when available', () => {
      const part: GmailMessagePart = {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: btoa('Hello World') } },
          { mimeType: 'text/html', body: { data: btoa('<p>Hello World</p>') } },
        ],
      };
      const result = EmailContentUtil.extractGmailText(part);
      expect(result.text).toBe('Hello World');
      expect(result.usedHtmlFallback).toBe(false);
    });

    it('falls back to text/html when no text/plain', () => {
      const part: GmailMessagePart = {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/html', body: { data: btoa('<p>HTML Content</p>') } },
        ],
      };
      const result = EmailContentUtil.extractGmailText(part);
      expect(result.text).toContain('HTML Content');
      expect(result.usedHtmlFallback).toBe(true);
    });

    it('handles undefined payload', () => {
      const result = EmailContentUtil.extractGmailText(undefined);
      expect(result.text).toBe('');
      expect(result.usedHtmlFallback).toBe(true);
    });
  });

  describe('stripHtml', () => {
    it('strips HTML tags and returns text', () => {
      const result = EmailContentUtil.stripHtml('<p>Hello <b>World</b></p>');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('skips script and style content', () => {
      const html = '<script>alert("xss")</script><p>Content</p>';
      const result = EmailContentUtil.stripHtml(html);
      expect(result).not.toContain('alert');
      expect(result).toContain('Content');
    });
  });

  describe('normalizeText', () => {
    it('normalizes line endings and trims', () => {
      const result = EmailContentUtil.normalizeText('  Hello\r\nWorld\r\n  \r\n  \r\n\r\nEnd  ');
      expect(result).toBe('Hello\nWorld\n\nEnd');
    });
  });

  describe('truncate', () => {
    it('returns full text when within limit', () => {
      expect(EmailContentUtil.truncate('short', 100)).toBe('short');
    });

    it('truncates with message when over limit', () => {
      const result = EmailContentUtil.truncate('This is a very long text', 10);
      expect(result).toContain('[Message truncated before summarization.]');
    });
  });

  describe('isFromMailbox', () => {
    it('returns true when from matches mailbox', () => {
      expect(EmailContentUtil.isFromMailbox('User <user@example.com>', 'user@example.com')).toBe(true);
    });

    it('returns false when from does not match', () => {
      expect(EmailContentUtil.isFromMailbox('Other <other@example.com>', 'user@example.com')).toBe(false);
    });

    it('returns false when either argument is null/undefined', () => {
      expect(EmailContentUtil.isFromMailbox(null, 'user@example.com')).toBe(false);
      expect(EmailContentUtil.isFromMailbox('user@example.com', null)).toBe(false);
    });
  });

  describe('buildAlternativeMimeBody', () => {
    it('builds multipart/alternative MIME body', () => {
      const body = EmailContentUtil.buildAlternativeMimeBody('text version', '<p>html version</p>', 'boundary123');
      expect(body).toContain('--boundary123');
      expect(body).toContain('Content-Type: text/plain');
      expect(body).toContain('Content-Type: text/html');
      expect(body).toContain('--boundary123--');
    });
  });

  describe('sanitizeHtml', () => {
    it('allows safe anchor tags', () => {
      const result = EmailContentUtil.sanitizeHtml('Click <a href="https://example.com">here</a> now');
      expect(result).toContain('<a href="https://example.com">here</a>');
    });

    it('escapes non-anchor HTML', () => {
      const result = EmailContentUtil.sanitizeHtml('<script>evil</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });
});
