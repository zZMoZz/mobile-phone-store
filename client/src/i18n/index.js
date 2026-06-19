import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

export const LANGUAGES = ['ar', 'en'];
const STORAGE_KEY = 'store.language';

export function getStoredLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return LANGUAGES.includes(saved) ? saved : 'ar';
}

/** True only when the user has explicitly picked a language (header switcher or
 * Settings save). Lets the configured default language apply on a fresh device. */
export function hasLanguageOverride() {
  return LANGUAGES.includes(localStorage.getItem(STORAGE_KEY));
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/**
 * Switches language and updates <html> lang/dir for RTL. Persists the choice as a
 * user override by default; pass { persist: false } when merely applying a default
 * (startup / the configured default language) so it doesn't masquerade as a choice.
 */
export function setLanguage(lng, { persist = true } = {}) {
  i18n.changeLanguage(lng);
  if (persist) localStorage.setItem(STORAGE_KEY, lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  // Browser tab title is owned by SettingsProvider (shows the store name).
}

// Apply direction on load without recording a fake override.
setLanguage(getStoredLanguage(), { persist: false });

export default i18n;
