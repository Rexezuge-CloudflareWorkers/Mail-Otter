/* eslint-disable @typescript-eslint/no-explicit-any */

import { GetCurrentUserRoute as OriginalGetCurrentUserRoute } from './user/me/GET';
import { ListApplicationsRoute as OriginalListApplicationsRoute } from './user/applications/GET';
import { CreateApplicationRoute as OriginalCreateApplicationRoute } from './user/application/POST';
import { UpdateApplicationRoute as OriginalUpdateApplicationRoute } from './user/application/PUT';
import { DeleteApplicationRoute as OriginalDeleteApplicationRoute } from './user/application/DELETE';
import { UpdateApplicationContextRoute as OriginalUpdateApplicationContextRoute } from './user/application/context/PUT';
import { DeleteApplicationContextDocumentsRoute as OriginalDeleteApplicationContextDocumentsRoute } from './user/application/context/delete-documents/POST';
import { ListApplicationContextDocumentsRoute as OriginalListApplicationContextDocumentsRoute } from './user/application/context/documents/GET';
import { ListApplicationContextDeletionRunsRoute as OriginalListApplicationContextDeletionRunsRoute } from './user/application/context/deletions/GET';
import { GetApplicationContextDocumentProviderLinkRoute as OriginalGetApplicationContextDocumentProviderLinkRoute } from './user/application/context/document/provider-link/GET';
import { CreateOAuth2AuthorizationRoute as OriginalCreateOAuth2AuthorizationRoute } from './user/application/oauth2/authorize/POST';
import { StartApplicationWatchRoute as OriginalStartApplicationWatchRoute } from './user/application/watch/POST';
import { StopApplicationWatchRoute as OriginalStopApplicationWatchRoute } from './user/application/stop/POST';
import { OAuth2CallbackRoute as OriginalOAuth2CallbackRoute } from './api/oauth2/callback/GET';
import { GmailWebhookRoute as OriginalGmailWebhookRoute } from './api/webhooks/gmail/POST';
import { OutlookWebhookRoute as OriginalOutlookWebhookRoute } from './api/webhooks/outlook/POST';
import { OutlookLifecycleWebhookRoute as OriginalOutlookLifecycleWebhookRoute } from './api/webhooks/outlook/lifecycle/POST';

export const GetCurrentUserRoute: any = OriginalGetCurrentUserRoute;
export const ListApplicationsRoute: any = OriginalListApplicationsRoute;
export const CreateApplicationRoute: any = OriginalCreateApplicationRoute;
export const UpdateApplicationRoute: any = OriginalUpdateApplicationRoute;
export const DeleteApplicationRoute: any = OriginalDeleteApplicationRoute;
export const UpdateApplicationContextRoute: any = OriginalUpdateApplicationContextRoute;
export const DeleteApplicationContextDocumentsRoute: any = OriginalDeleteApplicationContextDocumentsRoute;
export const ListApplicationContextDocumentsRoute: any = OriginalListApplicationContextDocumentsRoute;
export const ListApplicationContextDeletionRunsRoute: any = OriginalListApplicationContextDeletionRunsRoute;
export const GetApplicationContextDocumentProviderLinkRoute: any = OriginalGetApplicationContextDocumentProviderLinkRoute;
export const CreateOAuth2AuthorizationRoute: any = OriginalCreateOAuth2AuthorizationRoute;
export const StartApplicationWatchRoute: any = OriginalStartApplicationWatchRoute;
export const StopApplicationWatchRoute: any = OriginalStopApplicationWatchRoute;
export const OAuth2CallbackRoute: any = OriginalOAuth2CallbackRoute;
export const GmailWebhookRoute: any = OriginalGmailWebhookRoute;
export const OutlookWebhookRoute: any = OriginalOutlookWebhookRoute;
export const OutlookLifecycleWebhookRoute: any = OriginalOutlookLifecycleWebhookRoute;
