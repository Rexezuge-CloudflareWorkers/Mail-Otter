class BaseUrlUtil {
  public static getBaseUrl(request: Request): string {
    const url: URL = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }
}

export { BaseUrlUtil };
