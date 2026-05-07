import { ApplicationContextDAO, ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import type { ApplicationContextDocumentSource, ConnectedApplicationMetadata } from '@mail-otter/shared/model';

class GetApplicationContextDocumentProviderLinkRoute extends IUserRoute<
  GetApplicationContextDocumentProviderLinkRequest,
  GetApplicationContextDocumentProviderLinkResponse,
  GetApplicationContextDocumentProviderLinkEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Create a provider link for an indexed context document',
    responses: {
      '200': {
        description: 'Provider link for the indexed context document',
      },
    },
  };

  protected async handleRequest(
    _request: GetApplicationContextDocumentProviderLinkRequest,
    env: GetApplicationContextDocumentProviderLinkEnv,
    cxt: RouteContext<GetApplicationContextDocumentProviderLinkEnv>,
  ): Promise<GetApplicationContextDocumentProviderLinkResponse> {
    const contextDocumentId: string | undefined = cxt.req.param('contextDocumentId');
    if (!contextDocumentId) {
      throw new BadRequestError('Context document id is required.');
    }

    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const contextDAO = new ApplicationContextDAO(env.DB);
    const document: ApplicationContextDocumentSource | undefined = await contextDAO.getDocumentSourceForUser(contextDocumentId, userEmail);
    if (!document) {
      throw new BadRequestError('Context document was not found.');
    }

    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(document.applicationId, userEmail);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }

    return {
      url: GetApplicationContextDocumentProviderLinkRoute.getProviderUrl(document, application),
    };
  }

  private static getProviderUrl(document: ApplicationContextDocumentSource, application: ConnectedApplicationMetadata): string {
    if (document.sourceProviderId === PROVIDER_GOOGLE_GMAIL) {
      const url = new URL('https://mail.google.com/mail/u/');
      if (application.providerEmail) url.searchParams.set('authuser', application.providerEmail);
      url.hash = `all/${document.sourceThreadId || document.sourceDocumentId}`;
      return url.toString();
    }

    if (document.sourceProviderId === PROVIDER_MICROSOFT_OUTLOOK) {
      const url = new URL(`https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(document.sourceDocumentId)}`);
      if (application.providerEmail) url.searchParams.set('login_hint', application.providerEmail);
      return url.toString();
    }

    throw new BadRequestError('Unsupported context document provider.');
  }
}

type GetApplicationContextDocumentProviderLinkRequest = IRequest;

interface GetApplicationContextDocumentProviderLinkResponse extends IResponse {
  url: string;
}

type GetApplicationContextDocumentProviderLinkEnv = IUserEnv;

export { GetApplicationContextDocumentProviderLinkRoute };
