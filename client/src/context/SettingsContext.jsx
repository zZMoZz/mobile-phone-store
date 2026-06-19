import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { getSettings } from '../api/settings.js';
import { COLOR_SCHEME_KEY } from '../theme/index.js';
import { setLanguage, hasLanguageOverride } from '../i18n/index.js';

const SettingsContext = createContext(null);

/**
 * Loads store-wide settings once and shares them app-wide. Derives the
 * language-aware store name (used in the header + browser tab) and applies the
 * configured default light/dark theme on first load.
 */
export function SettingsProvider({ children }) {
  const { t, i18n } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        // Apply the configured default theme only when the user hasn't picked a
        // color scheme themselves yet (the header toggle persists under this key).
        if (s?.default_theme && !localStorage.getItem(COLOR_SCHEME_KEY)) {
          setColorScheme(s.default_theme);
        }
        // Likewise, apply the configured default language until the user picks one.
        if (s?.default_language && !hasLanguageOverride()) {
          setLanguage(s.default_language, { persist: false });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store name for the active language, falling back to the other language and
  // then to the generic app title so the header/tab is never blank.
  const storeName = useMemo(() => {
    const en = settings?.store_name_en?.trim();
    const ar = settings?.store_name_ar?.trim();
    const primary = i18n.language === 'ar' ? ar : en;
    const secondary = i18n.language === 'ar' ? en : ar;
    return primary || secondary || t('app.title');
  }, [settings, i18n.language, t]);

  // Keep the browser tab in sync with the store name (and language).
  useEffect(() => {
    document.title = storeName;
  }, [storeName]);

  const value = useMemo(() => ({ settings, setSettings, storeName }), [settings, storeName]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
