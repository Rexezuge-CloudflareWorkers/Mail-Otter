import { useTranslation } from 'react-i18next';
import { ZERO_TRUST_AUTHENTICATION_PATH } from '../../lib/constants';

function authenticateWithZeroTrust() {
  globalThis.location.assign(ZERO_TRUST_AUTHENTICATION_PATH);
}

export default function Unauthorized() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-primary)] flex items-center justify-center">
      <div className="text-center px-6">
        <div className="text-3xl font-semibold mb-1 tracking-tight">
          <span className="text-[var(--color-accent)]">Mail</span>-Otter
        </div>
        <h1 className="text-lg font-medium mt-4 mb-1">{t('unauthorized.title', 'Access Required')}</h1>
        <p className="text-[var(--color-text-secondary)] text-sm">{t('unauthorized.message', 'You Must Authenticate To Access This Application.')}</p>
        <button
          type="button"
          onClick={authenticateWithZeroTrust}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[#0d1008] transition-colors hover:bg-[var(--color-accent-dim)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          {t('unauthorized.action', 'Authenticate with Cloudflare Zero Trust')}
        </button>
      </div>
    </div>
  );
}
