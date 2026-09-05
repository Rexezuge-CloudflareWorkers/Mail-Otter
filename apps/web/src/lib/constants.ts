export const NOTICE_TIMEOUT_MS = 6000;
export const COPY_FEEDBACK_TIMEOUT_MS = 1500;
export const FORM_HIGHLIGHT_TIMEOUT_MS = 1500;

export const ZERO_TRUST_AUTHENTICATION_PATH = '/user/';

export interface OAuth2Feature {
  label: string;
}

export const OAUTH2_FEATURES: Record<string, OAuth2Feature> = {
  calendar: { label: 'Calendar' },
  google_drive: { label: 'Google Drive' },
  onedrive: { label: 'OneDrive' },
};

export const OAUTH2_FEATURE_SCOPES: Record<string, Record<string, string[]>> = {
  calendar: {
    'google-gmail': ['https://www.googleapis.com/auth/calendar.events'],
    'microsoft-outlook': ['https://graph.microsoft.com/Calendars.ReadWrite'],
    'fastmail-jmap': ['urn:ietf:params:jmap:calendars'],
  },
  google_drive: {
    'google-gmail': ['https://www.googleapis.com/auth/drive.readonly'],
  },
  onedrive: {
    'microsoft-outlook': ['https://graph.microsoft.com/Files.Read'],
  },
};
