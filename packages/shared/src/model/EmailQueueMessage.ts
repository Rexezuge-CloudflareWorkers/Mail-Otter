interface GmailNotificationQueueMessage {
  type: 'gmail-notification';
  applicationId: string;
  notificationHistoryId: string;
  pubsubMessageId?: string | undefined;
  callbackBaseUrl?: string | undefined;
}

interface OutlookNotificationQueueMessage {
  type: 'outlook-notification';
  applicationId: string;
  subscriptionId: string;
  messageId: string;
  callbackBaseUrl?: string | undefined;
}

type EmailQueueMessage = GmailNotificationQueueMessage | OutlookNotificationQueueMessage;

export type { EmailQueueMessage, GmailNotificationQueueMessage, OutlookNotificationQueueMessage };
