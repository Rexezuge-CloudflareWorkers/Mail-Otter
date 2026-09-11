import {
  PROVIDER_FASTMAIL_JMAP,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
  PROVIDER_YAHOO_MAIL,
} from '@mail-otter/shared/constants';
import { BadRequestError } from '@mail-otter/backend-errors';

interface OAuth2Strategy {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  requiredScopes: string;
  extraAuthParams: Readonly<Record<string, string>>;
}

const OAUTH2_STRATEGIES: Readonly<Record<string, OAuth2Strategy>> = {
  [PROVIDER_GOOGLE_GMAIL]: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    requiredScopes:
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  [PROVIDER_MICROSOFT_OUTLOOK]: {
    authorizationEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    requiredScopes:
      'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access',
    extraAuthParams: { response_mode: 'query' },
  },
  [PROVIDER_FASTMAIL_JMAP]: {
    authorizationEndpoint: 'https://api.fastmail.com/oauth/authorize',
    tokenEndpoint: 'https://api.fastmail.com/oauth/token',
    requiredScopes: 'urn:ietf:params:jmap:core urn:ietf:params:jmap:mail urn:ietf:params:jmap:submission',
    extraAuthParams: {},
  },
  [PROVIDER_YAHOO_MAIL]: {
    authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
    tokenEndpoint: 'https://api.login.yahoo.com/oauth2/get_token',
    requiredScopes: 'mail-r mail-w',
    extraAuthParams: { response_mode: 'query' },
  },
} as const;

function getOAuth2Strategy(providerId: string): OAuth2Strategy {
  const strategy = OAUTH2_STRATEGIES[providerId];
  if (!strategy) {
    throw new BadRequestError(`Unsupported OAuth2 provider: ${providerId}`);
  }
  return strategy;
}

export { OAUTH2_STRATEGIES, getOAuth2Strategy };
export type { OAuth2Strategy };
