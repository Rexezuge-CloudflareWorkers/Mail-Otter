import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle } from '../ui/Card';

function StepList({ children }: { children: React.ReactNode }) {
  return <ol className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)] list-decimal list-inside leading-relaxed">{children}</ol>;
}

function BulletList({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)] list-disc list-inside leading-relaxed">{children}</ul>;
}

function ScopeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-text-secondary)] font-mono overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export function HelpView() {
  const { t } = useTranslation();
  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{t('help.title', 'Help')}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('help.subtitle', 'Connect Your Email Account To Mail-Otter')}</p>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.howItWorks', 'How It Works')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {t('help.howItWorksIntro', 'Mail-Otter connects to your email using OAuth2. You register a private OAuth app with your email provider, supply the Client ID and Client Secret to Mail-Otter, and then authorize access from inside the app. Once connected, Mail-Otter monitors your inbox for new messages, summarizes them with AI, and delivers the summary as a reply in the same email thread — keeping everything organized in one place.')}
        </p>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {t('help.howItWorksFollow', 'Follow the provider-specific steps below to create your OAuth app, then return to the')}{' '}
          <strong>{t('header.tabs.mailboxes', 'Mailboxes')}</strong>{' '}
          {t('help.howItWorksFollowEnd', 'tab to create and authorize your mailbox.')}
        </p>
      </Card>

      {/* Gmail Setup */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.gmailSetup', 'Gmail Setup')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('help.gmailIntro', 'Gmail requires an OAuth app in Google Cloud Console and a Pub/Sub topic for push notifications.')}
        </p>
        <StepList>
          <li>
            {t('help.gmailStep1a', 'Open')}{' '}
            <a
              href="https://console.cloud.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline underline-offset-2"
            >
              Google Cloud Console
            </a>{' '}
            {t('help.gmailStep1b', 'and create or select a project.')}
          </li>
          <li>
            {t('help.gmailStep2a', 'Enable the')} <strong>Gmail API</strong> {t('help.gmailStep2b', 'from')}{' '}
            <strong>APIs &amp; Services → Library</strong>.
          </li>
          <li>
            {t('help.gmailStep3', 'Go to')} <strong>APIs &amp; Services → Credentials → Create Credentials → OAuth Client ID</strong>.
          </li>
          <li>
            {t('help.gmailStep4a', 'Choose')} <strong>Web Application</strong> {t('help.gmailStep4b', 'as the application type.')}
          </li>
          <li>
            {t('help.gmailStep5a', 'In the Mail-Otter')} <strong>{t('header.tabs.mailboxes', 'Mailboxes')}</strong>{' '}
            {t('help.gmailStep5b', 'tab, create a new Gmail mailbox. Copy the')}{' '}
            <strong>{t('help.redirectUri', 'Redirect URI')}</strong> {t('help.redirectUriHint', 'displayed in the form.')}
          </li>
          <li>
            {t('help.gmailStep6a', 'Back in Google Cloud Console, paste the redirect URI under')}{' '}
            <strong>Authorized Redirect URIs</strong> {t('help.gmailStep6b', 'and save the client.')}
          </li>
          <li>
            {t('help.gmailStep7a', 'Copy the')} <strong>Client ID</strong> {t('help.gmailStep7b', 'and')}{' '}
            <strong>Client Secret</strong> {t('help.gmailStep7c', 'from Google and paste them into the Mail-Otter mailbox form.')}
          </li>
          <li>
            {t('help.gmailStep8a', 'Create a')} <strong>Pub/Sub Topic</strong> {t('help.gmailStep8b', 'in the same project:')}{' '}
            <strong>Cloud Pub/Sub → Topics → Create Topic</strong>.
          </li>
          <li>
            {t('help.gmailStep9a', 'Grant the service account')}{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              gmail-api-push@system.gserviceaccount.com
            </code>{' '}
            {t('help.gmailStep9b', 'the')} <strong>Pub/Sub Publisher</strong> {t('help.gmailStep9c', 'role on the topic.')}
          </li>
          <li>
            {t('help.gmailStep10', 'In Mail-Otter, enter the topic name using the format')}{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              projects/&#123;projectId&#125;/topics/&#123;topicName&#125;
            </code>
            .
          </li>
          <li>
            {t('help.gmailStep11a', 'Click')} <strong>{t('help.authorizeOAuth2', 'Authorize OAuth2')}</strong>{' '}
            {t('help.gmailStep11b', 'in Mail-Otter and sign in with your Google account.')}
          </li>
          <li>
            {t('help.gmailStep12a', 'Click')} <strong>{t('help.startWatch', 'Start Watch')}</strong>
            {t('help.gmailStep12b', '. Mail-Otter will show you a webhook URL.')}
          </li>
          <li>
            {t('help.gmailStep13a', 'In Google Cloud Console, open your Pub/Sub topic and create a')}{' '}
            <strong>Push Subscription</strong>
            {t('help.gmailStep13b', '. Set the endpoint URL to the webhook URL shown in Mail-Otter.')}
          </li>
        </StepList>
        <p className="mt-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          {t('help.requiredScopes', 'Required Scopes (Requested Automatically)')}
        </p>
        <ScopeBlock>
          {`https://www.googleapis.com/auth/gmail.readonly\nhttps://www.googleapis.com/auth/gmail.send`}
        </ScopeBlock>
      </Card>

      {/* Outlook Setup */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.outlookSetup', 'Outlook Setup')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('help.outlookIntro', 'Outlook requires an app registration in the Azure Portal. Push notifications are handled automatically — no Pub/Sub setup needed.')}
        </p>
        <StepList>
          <li>
            {t('help.outlookStep1a', 'Open the')}{' '}
            <a
              href="https://portal.azure.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline underline-offset-2"
            >
              Azure Portal
            </a>{' '}
            {t('help.outlookStep1b', 'and go to')} <strong>Microsoft Entra ID → App Registrations → New Registration</strong>.
          </li>
          <li>
            {t('help.outlookStep2a', 'Set')} <strong>Supported Account Types</strong> {t('help.outlookStep2b', 'to')}{' '}
            <strong>Personal Microsoft Accounts Only</strong>.
          </li>
          <li>
            {t('help.outlookStep3a', 'In the Mail-Otter')} <strong>{t('header.tabs.mailboxes', 'Mailboxes')}</strong>{' '}
            {t('help.outlookStep3b', 'tab, create a new Outlook mailbox. Copy the')}{' '}
            <strong>{t('help.redirectUri', 'Redirect URI')}</strong> {t('help.redirectUriHint', 'displayed in the form.')}
          </li>
          <li>
            {t('help.outlookStep4a', 'Back in Azure, go to')} <strong>Authentication → Platform Configurations → Add A Platform</strong>.
            {t('help.outlookStep4b', ' Choose')} <strong>Web</strong> {t('help.outlookStep4c', 'and paste the redirect URI.')}
          </li>
          <li>
            {t('help.outlookStep5a', 'Go to')} <strong>Certificates &amp; Secrets → New Client Secret</strong>
            {t('help.outlookStep5b', '. Copy the secret value immediately — it will not be shown again.')}
          </li>
          <li>
            {t('help.outlookStep6a', 'Copy the')} <strong>Application (Client) ID</strong>{' '}
            {t('help.outlookStep6b', 'from the app overview page. Paste both the Client ID and Client Secret into the Mail-Otter mailbox form.')}
          </li>
          <li>
            {t('help.outlookStep7a', 'Click')} <strong>{t('help.authorizeOAuth2', 'Authorize OAuth2')}</strong>{' '}
            {t('help.outlookStep7b', 'in Mail-Otter and sign in with your Microsoft account.')}
          </li>
          <li>
            {t('help.outlookStep8a', 'Click')} <strong>{t('help.startWatch', 'Start Watch')}</strong>
            {t('help.outlookStep8b', '. Mail-Otter will register push notifications with Microsoft Graph automatically.')}
          </li>
        </StepList>
        <p className="mt-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          {t('help.requiredPermissions', 'Required Delegated Permissions (Requested Automatically)')}
        </p>
        <ScopeBlock>{`Mail.Read  Mail.ReadWrite  Mail.Send  offline_access`}</ScopeBlock>
      </Card>

      {/* IMAP Password */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.imapSetup', 'IMAP Password Connections')}</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {t('help.imapIntro', 'Gmail, Outlook, Fastmail, and iCloud can connect using an IMAP password instead of OAuth2. Select')}{' '}
          <strong>{t('help.imapPassword', 'IMAP Password')}</strong>{' '}
          {t('help.imapIntroEnd', 'as the connection method in the mailbox form and fill in the host, port, username, and password fields.')}
        </p>
        <BulletList>
          <li>
            <strong>Gmail</strong>
            {t('help.imapGmail', ' — generate an App Password from your Google account security settings. This requires 2-Step Verification to be enabled on your account.')}
          </li>
          <li>
            <strong>Outlook</strong>
            {t('help.imapOutlook', ' — use your account password, or generate an App Password if two-factor authentication is enabled.')}
          </li>
          <li>
            <strong>iCloud</strong> {t('help.imapIcloudA', '— create an')}{' '}
            <strong>{t('help.appSpecificPassword', 'App-Specific Password')}</strong>{' '}
            {t('help.imapIcloudB', 'from your Apple ID settings at')}{' '}
            <a
              href="https://appleid.apple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline underline-offset-2"
            >
              appleid.apple.com
            </a>
            {t('help.imapIcloudC', '. iCloud does not support OAuth2.')}
          </li>
          <li>
            <strong>Fastmail</strong> {t('help.imapFastmailA', '— generate an App Password from Fastmail’s settings under')}{' '}
            <strong>Privacy &amp; Security → Passwords</strong>.
          </li>
        </BulletList>
      </Card>

      {/* Optional Features */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.features', 'Optional Features')}</CardTitle>
        </CardHeader>
        <BulletList>
          <li>
            <strong>{t('help.calendarFeature', 'Calendar')}</strong>
            {t('help.calendarBodyA', ' — enables Mail-Otter to create calendar events extracted from emails. Enabling this feature for Gmail adds the')}{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              https://www.googleapis.com/auth/calendar.events
            </code>{' '}
            {t('help.calendarBodyB', 'scope; for Outlook it adds')}{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              Calendars.ReadWrite
            </code>
            {t('help.calendarBodyC', '. You must click')} <strong>{t('help.authorizeOAuth2', 'Authorize OAuth2')}</strong>{' '}
            {t('help.calendarBodyD', 'again after enabling a new feature to grant the additional permissions.')}
          </li>
        </BulletList>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>{t('help.notes', 'Notes')}</CardTitle>
        </CardHeader>
        <BulletList>
          <li>
            {t('help.noteRedirectA', 'The')} <strong>{t('help.redirectUri', 'Redirect URI')}</strong>{' '}
            {t('help.noteRedirectB', 'is unique to each mailbox and is generated by Mail-Otter. Copy it from the mailbox form before registering it with your provider — using the wrong URI will cause the OAuth2 authorization to fail.')}
          </li>
          <li>
            {t('help.noteGmailWatchA', 'Gmail watch tokens expire periodically. Mail-Otter renews them automatically via its scheduled job. If push notifications stop working, open the mailbox in Mail-Otter and click')}{' '}
            <strong>{t('help.startWatch', 'Start Watch')}</strong> {t('help.noteGmailWatchB', 'again.')}
          </li>
          <li>
            {t('help.noteOutlookRenewal', 'Outlook subscriptions are renewed automatically every hour — no manual action is required after initial setup.')}
          </li>
        </BulletList>
      </Card>
    </main>
  );
}
