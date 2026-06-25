interface GmailNotificationQueueMessage {
  type: 'gmail-notification';
  applicationId: string;
  notificationHistoryId: string;
  pubsubMessageId?: string;
  callbackBaseUrl?: string;
}

interface OutlookNotificationQueueMessage {
  type: 'outlook-notification';
  applicationId: string;
  subscriptionId: string;
  messageId: string;
  callbackBaseUrl?: string;
}

interface JmapNotificationQueueMessage {
  type: 'jmap-notification';
  applicationId: string;
  emailId: string;
  callbackBaseUrl?: string;
}

interface ImapNotificationQueueMessage {
  type: 'imap-notification';
  applicationId: string;
  messageUids: number[];
  newCursor: string;
  callbackBaseUrl?: string;
}

type EmailQueueMessage =
  | GmailNotificationQueueMessage
  | OutlookNotificationQueueMessage
  | JmapNotificationQueueMessage
  | ImapNotificationQueueMessage;

export type {
  EmailQueueMessage,
  GmailNotificationQueueMessage,
  ImapNotificationQueueMessage,
  JmapNotificationQueueMessage,
  OutlookNotificationQueueMessage,
};
