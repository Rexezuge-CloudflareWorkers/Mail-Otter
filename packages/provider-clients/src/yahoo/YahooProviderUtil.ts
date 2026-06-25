import { InternalServerError } from '@mail-otter/backend-errors';

class YahooProviderUtil {
  public static async getProfile(accessToken: string): Promise<{ email: string }> {
    const response = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new InternalServerError(`Yahoo userinfo fetch failed: ${response.statusText}`);
     
    const info: { email?: string } = await response.json();
    if (!info.email) throw new InternalServerError('Yahoo userinfo did not return an email address.');
    return { email: info.email };
  }
}

export { YahooProviderUtil };
