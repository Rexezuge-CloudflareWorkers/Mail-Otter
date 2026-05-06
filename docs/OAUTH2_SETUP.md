# OAuth2 And Push Setup

Mail-Otter handles OAuth2 authorization, encrypted refresh-token storage, provider watch registration, webhook receipt, queue processing, Workers AI summarization, and private self-addressed summary replies.

## Google Gmail

1. Create an OAuth client in Google Cloud Console.
2. Create a Pub/Sub topic in the same Google Cloud project as the OAuth client.
3. Grant `gmail-api-push@system.gserviceaccount.com` publish permission on the topic.
4. In Mail-Otter, create a `google-gmail / oauth2` connected mailbox with the OAuth client ID, client secret, and topic name.
5. Copy the generated redirect URI into the Google OAuth client.
6. Start OAuth2 from Mail-Otter.
7. Start Watch from Mail-Otter.
8. Configure the Pub/Sub push subscription to use the webhook URL shown after Start Watch.

Required scopes:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

Gmail watch renewal runs on the Worker cron path. If Gmail reports an expired history cursor, restart the watch.

## Microsoft Outlook

1. Create an app registration for personal Microsoft accounts.
2. In Mail-Otter, create a `microsoft-outlook / oauth2` connected mailbox with the client ID and client secret.
3. Copy the generated redirect URI into the Azure app registration.
4. Start OAuth2 from Mail-Otter.
5. Start Watch from Mail-Otter.

Required delegated permissions:

```text
Mail.Read
Mail.ReadWrite
Mail.Send
offline_access
```

Mail-Otter uses the `/consumers` Microsoft identity endpoint for personal Outlook accounts. Outlook subscriptions expire and are renewed by the hourly cron path.
