// Minimal IMAP client using cloudflare:sockets TCP API.
// Supports IMAPS (port 993) and STARTTLS (port 143/587).
// Only implements the commands needed by Mail-Otter: LOGIN, XOAUTH2, SELECT, UID SEARCH, UID FETCH.
import { connect } from 'cloudflare:sockets';
import { BadRequestError, InternalServerError } from '@mail-otter/backend-errors';

export interface ImapConnectOptions {
  host: string;
  port: number;
  username: string;
  auth: { method: 'PLAIN'; password: string } | { method: 'XOAUTH2'; accessToken: string };
  mailbox?: string;
}

export interface ImapFetchResult {
  uid: number;
  messageId: string;
  subject?: string;
  from?: string;
  date?: string;
  rawBody?: string;
}

export interface ImapSearchResult {
  uids: number[];
}

export class ImapClient {
  private socket: ReturnType<typeof connect> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer = '';
  private tagCounter = 0;

  public async connect(options: ImapConnectOptions): Promise<void> {
    const useImaps = options.port === 993 || options.port === 465;
    this.socket = connect(
      { hostname: options.host, port: options.port },
      useImaps ? { secureTransport: 'on', allowHalfOpen: false } : { secureTransport: 'starttls', allowHalfOpen: false },
    );
    const readable = this.socket.readable as ReadableStream<Uint8Array>;
    const writable = this.socket.writable as WritableStream<Uint8Array>;
    this.reader = readable.getReader();
    this.writer = writable.getWriter();

    await this.readUntilGreeting();

    if (!useImaps) {
      await this.startTls();
    }

    await this.authenticate(options.username, options.auth);
    await this.selectMailbox(options.mailbox ?? 'INBOX');
  }

  public async searchUidsSince(sinceUid: number): Promise<number[]> {
    const tag = this.nextTag();
    const criterion = sinceUid > 0 ? `${sinceUid + 1}:*` : '1:*';
    await this.send(`${tag} UID SEARCH UID ${criterion}`);
    const response = await this.readResponse(tag);
    const searchLine = response.find((line) => line.startsWith('* SEARCH'));
    if (!searchLine) return [];
    const parts = searchLine.replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean);
    return parts.map(Number).filter((n) => !Number.isNaN(n) && n > sinceUid);
  }

  public async fetchHeaders(uids: number[]): Promise<ImapFetchResult[]> {
    if (uids.length === 0) return [];
    const tag = this.nextTag();
    const uidSet = uids.join(',');
    await this.send(`${tag} UID FETCH ${uidSet} (UID RFC822.HEADER)`);
    const response = await this.readResponse(tag);
    return ImapClient.parseHeaders(response);
  }

  public async fetchBody(uid: number): Promise<string> {
    const tag = this.nextTag();
    await this.send(`${tag} UID FETCH ${uid} (BODY[])`);
    const response = await this.readResponse(tag);
    return response.join('\r\n');
  }

  public async append(mailbox: string, messageData: string, flags: string[] = [String.raw`\Seen`]): Promise<void> {
    const encoded = new TextEncoder().encode(messageData);
    const tag = this.nextTag();
    const flagList = flags.join(' ');
    await this.send(`${tag} APPEND "${mailbox}" (${flagList}) {${encoded.length}}`);
    const continuation = await this.readLine();
    if (!continuation.startsWith('+')) {
      throw new InternalServerError(`IMAP APPEND continuation not received: ${continuation.slice(0, 80)}`);
    }
    if (!this.writer) throw new InternalServerError('IMAP writer not initialized.');
    await this.writer.write(encoded);
    await this.writer.write(new TextEncoder().encode('\r\n'));
    await this.readResponse(tag);
  }

  public async close(): Promise<void> {
    try {
      const tag = this.nextTag();
      await this.send(`${tag} LOGOUT`);
    } catch {
      // best-effort
    }
    try {
      await this.reader?.cancel();
      await this.writer?.close();
      await this.socket?.close();
    } catch {
      // best-effort
    }
  }

  private async startTls(): Promise<void> {
    const tag = this.nextTag();
    await this.send(`${tag} STARTTLS`);
    await this.readResponse(tag);
    if (!this.socket) throw new InternalServerError('IMAP socket lost during STARTTLS.');
    await (this.socket as unknown as { startTls(): Promise<void> }).startTls();
  }

  private async authenticate(username: string, auth: ImapConnectOptions['auth']): Promise<void> {
    if (auth.method === 'XOAUTH2') {
      const xoauth2 = ImapClient.buildXoauth2(username, auth.accessToken);
      const tag = this.nextTag();
      await this.send(`${tag} AUTHENTICATE XOAUTH2 ${xoauth2}`);
      const response = await this.readResponse(tag);
      if (response.every((line) => !line.includes('OK'))) {
        throw new BadRequestError('IMAP XOAUTH2 authentication failed. Check OAuth2 token and IMAP access settings.');
      }
    } else {
      const escapedUser = JSON.stringify(username);
      const escapedPass = JSON.stringify(auth.password);
      const tag = this.nextTag();
      await this.send(`${tag} LOGIN ${escapedUser} ${escapedPass}`);
      const response = await this.readResponse(tag);
      if (response.every((line) => !line.includes('OK'))) {
        throw new BadRequestError('IMAP LOGIN failed. Check username and password.');
      }
    }
  }

  private async selectMailbox(mailbox: string): Promise<void> {
    const tag = this.nextTag();
    await this.send(`${tag} SELECT "${mailbox}"`);
    await this.readResponse(tag);
  }

  private async send(command: string): Promise<void> {
    if (!this.writer) throw new InternalServerError('IMAP writer not initialized.');
    const bytes = new TextEncoder().encode(`${command}\r\n`);
    await this.writer.write(bytes);
  }

  private async readLine(): Promise<string> {
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline !== -1) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, '');
        this.buffer = this.buffer.slice(newline + 1);
        return line;
      }
      if (!this.reader) throw new InternalServerError('IMAP reader not initialized.');
      const { value, done } = await this.reader.read();
      if (done) throw new InternalServerError('IMAP connection closed unexpectedly.');
      this.buffer += new TextDecoder().decode(value);
    }
  }

  private async readUntilGreeting(): Promise<void> {
    const line = await this.readLine();
    if (!line.startsWith('* OK')) {
      throw new InternalServerError(`Unexpected IMAP greeting: ${line.slice(0, 100)}`);
    }
  }

  private async readResponse(tag: string): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
        break;
      }
    }
    return lines;
  }

  private nextTag(): string {
    return `A${String(++this.tagCounter).padStart(4, '0')}`;
  }

  private static buildXoauth2(user: string, accessToken: string): string {
    const raw = `user=${user}\u{1}auth=Bearer ${accessToken}\u{1}\u{1}`;
    return btoa(raw);
  }

  private static parseHeaders(lines: string[]): ImapFetchResult[] {
    const results: ImapFetchResult[] = [];
    let currentUid: number | null = null;
    let headerLines: string[] = [];
    let inHeaders = false;

    for (const line of lines) {
      const fetchMatch = /^\* \d+ FETCH .*UID (\d+)/.exec(line);
      if (fetchMatch) {
        if (currentUid !== null) {
          results.push(this.parseHeaderBlock(currentUid, headerLines));
        }
        currentUid = Number(fetchMatch[1]);
        headerLines = [];
        inHeaders = true;
        continue;
      }
      if (inHeaders && line === ')') {
        inHeaders = false;
        continue;
      }
      if (inHeaders && currentUid !== null) {
        headerLines.push(line);
      }
    }
    if (currentUid !== null && headerLines.length > 0) {
      results.push(this.parseHeaderBlock(currentUid, headerLines));
    }
    return results;
  }

  private static parseHeaderBlock(uid: number, lines: string[]): ImapFetchResult {
    const headers: Record<string, string> = {};
    let current = '';
    let currentKey = '';
    for (const line of lines) {
      if (line.startsWith('\t') || line.startsWith(' ')) {
        current += ' ' + line.trim();
      } else {
        if (currentKey) headers[currentKey.toLowerCase()] = current.trim();
        const colon = line.indexOf(':');
        if (colon > 0) {
          currentKey = line.slice(0, colon).trim();
          current = line.slice(colon + 1);
        }
      }
    }
    if (currentKey) headers[currentKey.toLowerCase()] = current.trim();
    return {
      uid,
      messageId: headers['message-id'] ?? `imap-uid-${uid}`,
      subject: headers['subject'],
      from: headers['from'],
      date: headers['date'],
    };
  }
}
