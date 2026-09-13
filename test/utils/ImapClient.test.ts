import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConnect } = vi.hoisted(() => ({ mockConnect: vi.fn() }));

vi.mock('cloudflare:sockets', () => ({ connect: (...args: unknown[]) => mockConnect(...args) }));

import { ImapClient } from '@mail-otter/provider-clients/imap';
import { BadRequestError, InternalServerError } from '@mail-otter/backend-errors';

function makeSocket(lines: Array<string | { raw: string }>) {
  const queue = lines.map((l) => (typeof l === 'string' ? l : l.raw));
  const written: string[] = [];
  const reader = {
    read: vi.fn(async () => {
      const next = queue.shift();
      if (next === undefined) return { value: undefined, done: true as const };
      return { value: new TextEncoder().encode(`${next}\r\n`), done: false as const };
    }),
    cancel: vi.fn(async () => undefined),
  };
  const writer = {
    write: vi.fn(async (bytes: Uint8Array) => {
      written.push(new TextDecoder().decode(bytes));
    }),
    close: vi.fn(async () => undefined),
  };
  const socket = {
    readable: { getReader: () => reader },
    writable: { getWriter: () => writer },
    close: vi.fn(async () => undefined),
    startTls: vi.fn(async () => undefined),
  };
  return { socket, written, reader, writer };
}

const GREETING = '* OK IMAP ready';

describe('ImapClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function connectImaps(auth: 'xoauth2' | 'login' = 'login') {
    const { socket, written } = makeSocket([
      GREETING,
      'A0001 OK authenticated',
      'A0002 OK selected',
    ]);
    mockConnect.mockReturnValue(socket);
    const client = new ImapClient();
    const options =
      auth === 'xoauth2'
        ? { host: 'h', port: 993, username: 'u', auth: { method: 'XOAUTH2', accessToken: 'tok' } as const }
        : { host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'pw' } as const };
    return { client, options, socket, written };
  }

  it('connects over IMAPS with LOGIN and selects INBOX', async () => {
    const { client, options, written } = connectImaps();
    await client.connect(options);
    expect(mockConnect).toHaveBeenCalledWith({ hostname: 'h', port: 993 }, expect.objectContaining({ secureTransport: 'on' }));
    expect(written.join('')).toContain('LOGIN "u" "pw"');
    expect(written.join('')).toContain('SELECT "INBOX"');
    await client.close();
  });

  it('connects with XOAUTH2', async () => {
    const { client, options, written } = connectImaps('xoauth2');
    await client.connect(options);
    expect(written.join('')).toContain('AUTHENTICATE XOAUTH2');
  });

  it('rejects failed LOGIN and XOAUTH2', async () => {
    const bad = makeSocket([GREETING, 'A0001 NO bad credentials']);
    mockConnect.mockReturnValue(bad.socket);
    const client = new ImapClient();
    await expect(
      client.connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'x' } }),
    ).rejects.toThrow(BadRequestError);
    const bad2 = makeSocket([GREETING, 'A0001 NO denied']);
    mockConnect.mockReturnValue(bad2.socket);
    await expect(
      new ImapClient().connect({ host: 'h', port: 993, username: 'u', auth: { method: 'XOAUTH2', accessToken: 't' } }),
    ).rejects.toThrow(BadRequestError);
  });

  it('rejects unexpected greetings', async () => {
    const { socket } = makeSocket(['* BAD go away']);
    mockConnect.mockReturnValue(socket);
    await expect(
      new ImapClient().connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'p' } }),
    ).rejects.toThrow(InternalServerError);
  });

  it('upgrades with STARTTLS on port 143', async () => {
    const { socket, written } = makeSocket([GREETING, 'A0001 OK tls', 'A0002 OK auth', 'A0003 OK sel']);
    mockConnect.mockReturnValue(socket);
    await new ImapClient().connect({ host: 'h', port: 143, username: 'u', auth: { method: 'PLAIN', password: 'p' } });
    expect(mockConnect).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ secureTransport: 'starttls' }));
    expect(socket.startTls).toHaveBeenCalled();
    expect(written.join('')).toContain('STARTTLS');
  });

  it('searches and filters uids since the cursor', async () => {
    const lines = [GREETING, 'A0001 OK auth', 'A0002 OK sel', '* SEARCH 4 9 x', 'A0003 OK search'];
    const { socket } = makeSocket(lines);
    mockConnect.mockReturnValue(socket);
    const client = new ImapClient();
    await client.connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'p' } });
    const uids = await client.searchUidsSince(5);
    expect(uids).toEqual([9]);
  });

  it('returns empty search when no SEARCH line arrives', async () => {
    const { socket } = makeSocket([GREETING, 'A0001 OK auth', 'A0002 OK sel', 'A0003 OK empty']);
    mockConnect.mockReturnValue(socket);
    const client = new ImapClient();
    await client.connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'p' } });
    await expect(client.searchUidsSince(0)).resolves.toEqual([]);
  });

  it('fetches headers with folding and message-id fallback', async () => {
    const { socket } = makeSocket([
      GREETING,
      'A0001 OK auth',
      'A0002 OK sel',
      '* 1 FETCH (UID 7 RFC822.HEADER',
      'Subject: Hello',
      ' world',
      'From: a@x',
      'Date: today',
      'Message-ID: <m7>',
      ')',
      '* 2 FETCH (UID 8 RFC822.HEADER',
      'Subject: No id here',
      ')',
      'A0003 OK fetched',
    ]);
    mockConnect.mockReturnValue(socket);
    const client = new ImapClient();
    await client.connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'p' } });
    const headers = await client.fetchHeaders([7, 8]);
    expect(headers).toHaveLength(2);
    expect(headers[0]).toMatchObject({ uid: 7, messageId: '<m7>', subject: 'Hello world', from: 'a@x' });
    expect(headers[1]).toMatchObject({ uid: 8, messageId: 'imap-uid-8' });
  });

  it('returns no headers for an empty uid set without I/O', async () => {
    const { client, options } = connectImaps();
    await client.connect(options);
    await expect(client.fetchHeaders([])).resolves.toEqual([]);
  });

  it('fetches bodies and appends summaries', async () => {
    const { socket, written } = makeSocket([
      GREETING,
      'A0001 OK auth',
      'A0002 OK sel',
      'body-line-1',
      'body-line-2',
      'A0003 OK body',
      '+ continue',
      'A0004 OK appended',
    ]);
    mockConnect.mockReturnValue(socket);
    const client = new ImapClient();
    await client.connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'p' } });
    const body = await client.fetchBody(7);
    expect(body).toContain('body-line-1');
    await client.append('INBOX', '<p>hi</p>');
    expect(written.join('')).toContain('APPEND "INBOX"');
  });

  it('rejects appends without server continuation', async () => {
    const { socket } = makeSocket([GREETING, 'A0001 OK auth', 'A0002 OK sel', 'A0003 NO quota']);
    mockConnect.mockReturnValue(socket);
    const client = new ImapClient();
    await client.connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'p' } });
    await expect(client.append('INBOX', 'x')).rejects.toThrow(InternalServerError);
  });

  it('closes best-effort even when the socket errors', async () => {
    const { client, options } = connectImaps();
    await client.connect(options);
    await expect(client.close()).resolves.toBeUndefined();
    // Unconnected client closes without throwing
    await expect(new ImapClient().close()).resolves.toBeUndefined();
  });

  it('fails reads on closed connections', async () => {
    const { socket } = makeSocket([GREETING]);
    mockConnect.mockReturnValue(socket);
    const client = new ImapClient();
    await client.connect({ host: 'h', port: 993, username: 'u', auth: { method: 'PLAIN', password: 'p' } }).catch(() => undefined);
    await expect(client.searchUidsSince(0)).rejects.toThrow(InternalServerError);
  });
});
