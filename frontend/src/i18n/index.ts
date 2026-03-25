// frontend/src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import common from '../locales/es/common';
import auth from '../locales/es/auth';
import dashboard from '../locales/es/dashboard';
import accounts from '../locales/es/accounts';
import journal from '../locales/es/journal';
import banks from '../locales/es/banks';
import reports from '../locales/es/reports';
import settings from '../locales/es/settings';
import ai from '../locales/es/ai';

i18n.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  resources: {
    es: {
      common,
      auth,
      dashboard,
      accounts,
      journal,
      banks,
      reports,
      settings,
      ai,
    },
  },
  interpolation: {
    escapeValue: false, // React ya escapa por defecto
  },
});

export default i18n;
