import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UnauthorizedError } from '@mail-otter/backend-errors';

interface EmailValidationEnv {
  DEV_AUTH_EMAIL?: string | undefined;
  TEAM_DOMAIN?: string | undefined;
  POLICY_AUD?: string | undefined;
}

class EmailValidationUtil {
  public static async getAuthenticatedUserEmail(request: Request, env: EmailValidationEnv): Promise<string> {
    const devEmail: string | undefined = env.DEV_AUTH_EMAIL;
    if (devEmail) {
      return devEmail;
    }

    const token: string | null = request.headers.get('cf-access-jwt-assertion');
    if (!token) {
      throw new UnauthorizedError('No Cloudflare Access JWT token provided in request headers.');
    }

    const teamDomain: string | undefined = env.TEAM_DOMAIN;
    const policyAud: string | undefined = env.POLICY_AUD;

    if (!teamDomain || !policyAud) {
      throw new UnauthorizedError('Missing required JWT verification configuration (TEAM_DOMAIN or POLICY_AUD not set).');
    }

    let normalizedTeamDomain: string = teamDomain;
    while (normalizedTeamDomain.endsWith('/')) {
      normalizedTeamDomain = normalizedTeamDomain.slice(0, -1);
    }
    const normalizedPolicyAud: string = policyAud.trim();

    if (!normalizedPolicyAud) {
      throw new UnauthorizedError('Missing required JWT verification configuration (empty POLICY_AUD).');
    }

    if (normalizedPolicyAud.includes(',')) {
      throw new UnauthorizedError('Multiple JWT audiences are not supported. Configure a single POLICY_AUD value.');
    }

    try {
      const JWKS = createRemoteJWKSet(new URL(`${normalizedTeamDomain}/cdn-cgi/access/certs`));
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: normalizedTeamDomain,
        audience: normalizedPolicyAud,
      });

      const email = payload.email as string;
      if (!email) {
        throw new UnauthorizedError('No email found in JWT token.');
      }
      return email;
    } catch (error) {
      throw new UnauthorizedError(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export { EmailValidationUtil };
export type { EmailValidationEnv };
