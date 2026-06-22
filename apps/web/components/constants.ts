const ZERO_TRUST_AUTHENTICATION_PATH = '/user/';

interface OAuth2Feature {
  label: string;
}

const OAUTH2_FEATURES: Record<string, OAuth2Feature> = {
  calendar: { label: 'Calendar' },
};

const OAUTH2_FEATURE_SCOPES: Record<string, Record<string, string[]>> = {
  calendar: {
    'google-gmail': ['https://www.googleapis.com/auth/calendar.events'],
    'microsoft-outlook': ['https://graph.microsoft.com/Calendars.ReadWrite'],
    'fastmail-jmap': ['urn:ietf:params:jmap:calendars'],
  },
};

export { OAUTH2_FEATURE_SCOPES, OAUTH2_FEATURES, ZERO_TRUST_AUTHENTICATION_PATH };
export type { OAuth2Feature };
