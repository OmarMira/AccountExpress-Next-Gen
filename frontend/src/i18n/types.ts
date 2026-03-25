// frontend/src/i18n/types.ts
// Tipado global para useTranslation — garantiza autocompletion y detección de claves inválidas.

import type common from '../locales/es/common';
import type auth from '../locales/es/auth';
import type dashboard from '../locales/es/dashboard';
import type accounts from '../locales/es/accounts';
import type journal from '../locales/es/journal';
import type banks from '../locales/es/banks';
import type reports from '../locales/es/reports';
import type settings from '../locales/es/settings';
import type ai from '../locales/es/ai';

export interface I18nResources {
  common: typeof common;
  auth: typeof auth;
  dashboard: typeof dashboard;
  accounts: typeof accounts;
  journal: typeof journal;
  banks: typeof banks;
  reports: typeof reports;
  settings: typeof settings;
  ai: typeof ai;
}

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: I18nResources;
  }
}
