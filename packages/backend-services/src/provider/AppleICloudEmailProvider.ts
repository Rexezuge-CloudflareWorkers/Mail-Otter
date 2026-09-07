import { PROVIDER_APPLE_ICLOUD } from '@mail-otter/shared/constants';
import { ConfigurableImapEmailProvider } from './ConfigurableImapEmailProvider';

class AppleICloudEmailProvider extends ConfigurableImapEmailProvider {
  constructor() {
    super({ providerId: PROVIDER_APPLE_ICLOUD, host: 'imap.mail.me.com', port: 993, noun: 'Apple iCloud' });
  }
}

export { AppleICloudEmailProvider };
