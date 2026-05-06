interface GmailNotificationQueueMessage {
  type: 'gmail-notification';
  applicationId: string;
  notificationHistoryId: string;
  pubsubMessageId?: string | undefined;
}

interface OutlookNotificationQueueMessage {
  type: 'outlook-notification';
  applicationId: string;
  subscriptionId: string;
  messageId: string;
}

type EmailQueueMessage = GmailNotificationQueueMessage | OutlookNotificationQueueMessage;

export type { EmailQueueMessage, GmailNotificationQueueMessage, OutlookNotificationQueueMessage };
