interface IHttpClient {
  fetchJson(url: string, init?: RequestInit): Promise<unknown>;
}

type StubHttpHandler = (url: string, init?: RequestInit) => unknown;

class HttpFetchError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`HTTP request failed (${status.toString()}): ${body || statusText}`);
    this.name = 'HttpFetchError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

class FetchHttpClient implements IHttpClient {
  public async fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
    const response: Response = await fetch(url, init);
    const text: string = await response.text();
    if (!response.ok) {
      throw new HttpFetchError(response.status, response.statusText, text);
    }
    return text ? (JSON.parse(text) as unknown) : {};
  }
}

class StubHttpClient implements IHttpClient {
  public readonly calls: Array<{ url: string; init?: RequestInit }> = [];
  private handler?: StubHttpHandler;
  private readonly queue: Array<{ kind: 'value'; value: unknown } | { kind: 'error'; error: Error }> = [];

  constructor(handler?: StubHttpHandler) {
    this.handler = handler;
  }

  public queueJson(value: unknown): this {
    this.queue.push({ kind: 'value', value });
    return this;
  }

  public queueError(error: Error): this {
    this.queue.push({ kind: 'error', error });
    return this;
  }

  public setHandler(handler: StubHttpHandler): this {
    this.handler = handler;
    return this;
  }

  public fetchJson(url: string, init?: RequestInit): Promise<unknown> {
    this.calls.push({ url, init });
    if (this.handler) {
      return Promise.resolve(this.handler(url, init));
    }
    const next = this.queue.shift();
    if (!next) {
      return Promise.reject(new Error(`StubHttpClient has no queued response for ${url}`));
    }
    if (next.kind === 'error') {
      return Promise.reject(next.error);
    }
    return Promise.resolve(next.value);
  }
}

export { FetchHttpClient, HttpFetchError, StubHttpClient };
export type { IHttpClient, StubHttpHandler };
