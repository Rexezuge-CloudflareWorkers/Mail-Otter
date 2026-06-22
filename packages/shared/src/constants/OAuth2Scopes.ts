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

export { OAUTH2_FEATURES, OAUTH2_FEATURE_SCOPES };
export type { OAuth2Feature };
