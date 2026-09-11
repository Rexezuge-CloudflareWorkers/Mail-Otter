import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAlternativeMimeBody,
  extractTextFromRaw,
  toCrlf,
} from '../../packages/provider-clients/src/email-content/MimeContentUtil';

describe('toCrlf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes lone LF endings to CRLF', () => {
    expect(toCrlf('a\nb\n')).toBe('a\r\nb\r\n');
  });

  it('normalizes lone CR endings to CRLF', () => {
    expect(toCrlf('a\rb')).toBe('a\r\nb');
  });

  it('keeps existing CRLF endings stable', () => {
    expect(toCrlf('a\r\nb\r\n')).toBe('a\r\nb\r\n');
  });

  it('handles mixed endings', () => {
    expect(toCrlf('a\r\nb\nc\rd')).toBe('a\r\nb\r\nc\r\nd');
  });
});

describe('buildAlternativeMimeBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a multipart body with plain and HTML sections', () => {
    const body = buildAlternativeMimeBody('Hello', '<p>Hello</p>', 'boundary-1');

    expect(body).toContain('--boundary-1');
    expect(body).toContain('Content-Type: text/plain; charset=utf-8');
    expect(body).toContain('Content-Type: text/html; charset=utf-8');
    expect(body).toContain('Hello');
    expect(body).toContain('<p>Hello</p>');
    expect(body).toContain('--boundary-1--');
  });
});

describe('extractTextFromRaw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts the body when no boundary is present and no headers exist', () => {
    expect(extractTextFromRaw('Just body text')).toBe('Just body text');
  });

  it('strips headers and HTML when no boundary is present', () => {
    const raw = 'From: a@example.com\r\nSubject: Hi\r\n\r\n<p>Hello</p>';
    expect(extractTextFromRaw(raw)).toBe('Hello');
  });

  it('prefers the text/plain part of multipart messages', () => {
    const raw = [
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Plain hello',
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>HTML hello</p>',
      '--b1--',
      '',
    ].join('\r\n');
    expect(extractTextFromRaw(raw)).toBe('Plain hello');
  });

  it('falls back to the text/html part when no plain part exists', () => {
    const raw = [
      'Content-Type: multipart/alternative; boundary=b2',
      '',
      '--b2',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Only html</p>',
      '--b2--',
      '',
    ].join('\r\n');
    expect(extractTextFromRaw(raw)).toBe('Only html');
  });

  it('returns an empty string when no text part exists', () => {
    const raw = [
      'Content-Type: multipart/mixed; boundary="b3"',
      '',
      '--b3',
      'Content-Type: application/octet-stream',
      '',
      'binary',
      '--b3--',
      '',
    ].join('\r\n');
    expect(extractTextFromRaw(raw)).toBe('');
  });

  it('skips preamble parts and parts without headers', () => {
    const raw = [
      'Content-Type: multipart/alternative; boundary="b4"',
      '',
      'preamble junk',
      '--b4',
      'no-headers-here',
      '--b4',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Found me',
      '--b4--',
      '',
    ].join('\r\n');
    expect(extractTextFromRaw(raw)).toBe('Found me');
  });
});
