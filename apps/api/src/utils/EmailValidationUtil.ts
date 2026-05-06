import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UnauthorizedError } from '@/error';

class EmailValidationUtil {
  public static async getAuthenticatedUserEmail(request: Request, env: Env): Promise<string> {
    const envRecord = env as unknown as Record<string, unknown>;
    const devEmail: string | undefined = envRecord.DEV_AUTH_EMAIL as string | undefined;
    if (devEmail) {
      return devEmail;
    }

    const token: string | null = request.headers.get('cf-access-jwt-assertion');
    if (!token) {
      throw new UnauthorizedError('No Cloudflare Access JWT token provided in request headers.');
    }

    const teamDomain: string | undefined = envRecord.TEAM_DOMAIN as string | undefined;
    const policyAud: string | undefined = envRecord.POLICY_AUD as string | undefined;

    if (!teamDomain || !policyAud) {
      throw new UnauthorizedError('Missing required JWT verification configuration (TEAM_DOMAIN or POLICY_AUD not set).');
    }

    const normalizedTeamDomain: string = teamDomain.replace(/\/+$/, '');
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
