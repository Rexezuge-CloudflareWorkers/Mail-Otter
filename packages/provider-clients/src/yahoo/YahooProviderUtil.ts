import { InternalServerError } from '@mail-otter/backend-errors';

interface YahooUserInfo {
  sub: string;
  email: string;
  name?: string;
}

class YahooProviderUtil {
  public static async getProfile(accessToken: string): Promise<{ email: string }> {
    const response = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new InternalServerError(`Yahoo userinfo fetch failed: ${response.statusText}`);
    const info = (await response.json()) as YahooUserInfo;
    if (!info.email) throw new InternalServerError('Yahoo userinfo did not return an email address.');
    return { email: info.email };
  }
}

export { YahooProviderUtil };
