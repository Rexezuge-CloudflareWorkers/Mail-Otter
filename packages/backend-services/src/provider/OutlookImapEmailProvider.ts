import { PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { ConfigurableImapEmailProvider } from './ConfigurableImapEmailProvider';

class OutlookImapEmailProvider extends ConfigurableImapEmailProvider {
  constructor() {
    super({ providerId: PROVIDER_MICROSOFT_OUTLOOK, host: 'outlook.office365.com', port: 993, noun: 'Outlook' });
  }
}

export { OutlookImapEmailProvider };
