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
  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-8 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Help</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Connect Your Email Account To Mail-Otter</p>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Mail-Otter connects to your email using OAuth2. You register a private OAuth app with your email
          provider, supply the Client ID and Client Secret to Mail-Otter, and then authorize access from
          inside the app. Once connected, Mail-Otter monitors your inbox for new messages, summarizes them
          with AI, and delivers the summary as a reply in the same email thread — keeping everything
          organized in one place.
        </p>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Follow the provider-specific steps below to create your OAuth app, then return to the{' '}
          <strong>Mailboxes</strong> tab to create and authorize your mailbox.
        </p>
      </Card>

      {/* Gmail Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Gmail Setup</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-muted)]">
          Gmail requires an OAuth app in Google Cloud Console and a Pub/Sub topic for push notifications.
        </p>
        <StepList>
          <li>
            Open{' '}
            <a
              href="https://console.cloud.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline underline-offset-2"
            >
              Google Cloud Console
            </a>{' '}
            and create or select a project.
          </li>
          <li>
            Enable the <strong>Gmail API</strong> from{' '}
            <strong>APIs &amp; Services → Library</strong>.
          </li>
          <li>
            Go to <strong>APIs &amp; Services → Credentials → Create Credentials → OAuth Client ID</strong>.
          </li>
          <li>
            Choose <strong>Web Application</strong> as the application type.
          </li>
          <li>
            In the Mail-Otter <strong>Mailboxes</strong> tab, create a new Gmail mailbox. Copy the{' '}
            <strong>Redirect URI</strong> displayed in the form.
          </li>
          <li>
            Back in Google Cloud Console, paste the redirect URI under{' '}
            <strong>Authorized Redirect URIs</strong> and save the client.
          </li>
          <li>
            Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from Google and paste
            them into the Mail-Otter mailbox form.
          </li>
          <li>
            Create a <strong>Pub/Sub Topic</strong> in the same project:{' '}
            <strong>Cloud Pub/Sub → Topics → Create Topic</strong>.
          </li>
          <li>
            Grant the service account{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              gmail-api-push@system.gserviceaccount.com
            </code>{' '}
            the <strong>Pub/Sub Publisher</strong> role on the topic.
          </li>
          <li>
            In Mail-Otter, enter the topic name using the format{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              projects/&#123;projectId&#125;/topics/&#123;topicName&#125;
            </code>
            .
          </li>
          <li>
            Click <strong>Authorize OAuth2</strong> in Mail-Otter and sign in with your Google account.
          </li>
          <li>
            Click <strong>Start Watch</strong>. Mail-Otter will show you a webhook URL.
          </li>
          <li>
            In Google Cloud Console, open your Pub/Sub topic and create a{' '}
            <strong>Push Subscription</strong>. Set the endpoint URL to the webhook URL shown in Mail-Otter.
          </li>
        </StepList>
        <p className="mt-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Required Scopes (Requested Automatically)
        </p>
        <ScopeBlock>
          {`https://www.googleapis.com/auth/gmail.readonly\nhttps://www.googleapis.com/auth/gmail.send`}
        </ScopeBlock>
      </Card>

      {/* Outlook Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Outlook Setup</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-muted)]">
          Outlook requires an app registration in the Azure Portal. Push notifications are handled
          automatically — no Pub/Sub setup needed.
        </p>
        <StepList>
          <li>
            Open the{' '}
            <a
              href="https://portal.azure.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline underline-offset-2"
            >
              Azure Portal
            </a>{' '}
            and go to <strong>Microsoft Entra ID → App Registrations → New Registration</strong>.
          </li>
          <li>
            Set <strong>Supported Account Types</strong> to{' '}
            <strong>Personal Microsoft Accounts Only</strong>.
          </li>
          <li>
            In the Mail-Otter <strong>Mailboxes</strong> tab, create a new Outlook mailbox. Copy the{' '}
            <strong>Redirect URI</strong> displayed in the form.
          </li>
          <li>
            Back in Azure, go to <strong>Authentication → Platform Configurations → Add A Platform</strong>.
            Choose <strong>Web</strong> and paste the redirect URI.
          </li>
          <li>
            Go to <strong>Certificates &amp; Secrets → New Client Secret</strong>. Copy the secret value
            immediately — it will not be shown again.
          </li>
          <li>
            Copy the <strong>Application (Client) ID</strong> from the app overview page. Paste both the
            Client ID and Client Secret into the Mail-Otter mailbox form.
          </li>
          <li>
            Click <strong>Authorize OAuth2</strong> in Mail-Otter and sign in with your Microsoft account.
          </li>
          <li>
            Click <strong>Start Watch</strong>. Mail-Otter will register push notifications with Microsoft
            Graph automatically.
          </li>
        </StepList>
        <p className="mt-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Required Delegated Permissions (Requested Automatically)
        </p>
        <ScopeBlock>{`Mail.Read  Mail.ReadWrite  Mail.Send  offline_access`}</ScopeBlock>
      </Card>

      {/* IMAP Password */}
      <Card>
        <CardHeader>
          <CardTitle>IMAP Password Connections</CardTitle>
        </CardHeader>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Gmail, Outlook, Fastmail, and iCloud can connect using an IMAP password instead of OAuth2.
          Select <strong>IMAP Password</strong> as the connection method in the mailbox form and fill in
          the host, port, username, and password fields.
        </p>
        <BulletList>
          <li>
            <strong>Gmail</strong> — generate an{' '}
            <strong>App Password</strong> from your Google account security settings. This requires
            2-Step Verification to be enabled on your account.
          </li>
          <li>
            <strong>Outlook</strong> — use your account password, or generate an App Password if
            two-factor authentication is enabled.
          </li>
          <li>
            <strong>iCloud</strong> — create an{' '}
            <strong>App-Specific Password</strong> from your Apple ID settings at{' '}
            <a
              href="https://appleid.apple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline underline-offset-2"
            >
              appleid.apple.com
            </a>
            . iCloud does not support OAuth2.
          </li>
          <li>
            <strong>Fastmail</strong> — generate an App Password from Fastmail's settings under{' '}
            <strong>Privacy &amp; Security → Passwords</strong>.
          </li>
        </BulletList>
      </Card>

      {/* Optional Features */}
      <Card>
        <CardHeader>
          <CardTitle>Optional Features</CardTitle>
        </CardHeader>
        <BulletList>
          <li>
            <strong>Calendar</strong> — enables Mail-Otter to create calendar events extracted from
            emails. Enabling this feature for Gmail adds the{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              https://www.googleapis.com/auth/calendar.events
            </code>{' '}
            scope; for Outlook it adds{' '}
            <code className="bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded text-xs font-mono">
              Calendars.ReadWrite
            </code>
            . You must click <strong>Authorize OAuth2</strong> again after enabling a new feature to
            grant the additional permissions.
          </li>
        </BulletList>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <BulletList>
          <li>
            The <strong>Redirect URI</strong> is unique to each mailbox and is generated by Mail-Otter.
            Copy it from the mailbox form before registering it with your provider — using the wrong
            URI will cause the OAuth2 authorization to fail.
          </li>
          <li>
            Gmail watch tokens expire periodically. Mail-Otter renews them automatically via its
            scheduled job. If push notifications stop working, open the mailbox in Mail-Otter and click{' '}
            <strong>Start Watch</strong> again.
          </li>
          <li>
            Outlook subscriptions are renewed automatically every hour — no manual action is required
            after initial setup.
          </li>
        </BulletList>
      </Card>
    </main>
  );
}
