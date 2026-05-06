interface OAuth2AuthorizationSession {
  sessionId: string;
  applicationId: string;
  stateHash: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
  consumedAt?: number | undefined;
}

interface OAuth2AuthorizationSessionInternal {
  session_id: string;
  application_id: string;
  state_hash: string;
  code_verifier: string;
  redirect_uri: string;
  created_at: number;
  expires_at: number;
  consumed_at?: number | undefined;
}

export type { OAuth2AuthorizationSession, OAuth2AuthorizationSessionInternal };
