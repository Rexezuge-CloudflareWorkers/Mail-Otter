export const methodLabels: Record<string, string> = {
  oauth2: 'OAuth2',
  'imap-password': 'IMAP Password',
};

export const providerLabels: Record<string, string> = {
  'google-gmail': 'Google Gmail',
  'microsoft-outlook': 'Microsoft Outlook',
  'fastmail-jmap': 'Fastmail',
  'yahoo-mail': 'Yahoo Mail',
  'custom-imap': 'Custom IMAP',
  'apple-icloud': 'Apple iCloud Mail',
};

export const providerConnectionMethods: Record<string, Array<'oauth2' | 'imap-password'>> = {
  'google-gmail': ['oauth2', 'imap-password'],
  'microsoft-outlook': ['oauth2', 'imap-password'],
  'fastmail-jmap': ['oauth2', 'imap-password'],
  'yahoo-mail': ['oauth2'],
  'custom-imap': ['oauth2', 'imap-password'],
  'apple-icloud': ['imap-password'],
};
