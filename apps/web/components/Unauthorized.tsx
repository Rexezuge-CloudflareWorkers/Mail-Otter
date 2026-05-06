import { ZERO_TRUST_AUTHENTICATION_PATH } from './constants';

export default function Unauthorized() {
  const authenticateWithZeroTrust = () => {
    window.location.assign(ZERO_TRUST_AUTHENTICATION_PATH);
  };

  return (
    <div className="min-h-screen bg-[#101319] text-white flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-2xl font-semibold mb-2">Unauthorized</h1>
        <p className="text-[#aab4c2]">You do not have access to this application.</p>
        <button
          type="button"
          onClick={authenticateWithZeroTrust}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-[#0f766e] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0d9488] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6ee7b7]"
        >
          Authenticate with Cloudflare Zero Trust
        </button>
      </div>
    </div>
  );
}
