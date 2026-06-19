import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider, DirectionProvider, localStorageColorSchemeManager } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';

import './i18n/index.js';
import { getStoredLanguage } from './i18n/index.js';
import { theme, COLOR_SCHEME_KEY } from './theme/index.js';
import App from './App.jsx';

const initialDirection = getStoredLanguage() === 'ar' ? 'rtl' : 'ltr';

// Persist the user's color-scheme choice under our own key so the SettingsProvider
// can tell whether the user has overridden the configured default theme.
const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_KEY });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DirectionProvider initialDirection={initialDirection} detectDirection={false}>
      <MantineProvider theme={theme} defaultColorScheme="light" colorSchemeManager={colorSchemeManager}>
        <Notifications position="top-center" />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MantineProvider>
    </DirectionProvider>
  </React.StrictMode>,
);

// Keep Mantine color scheme key referenced (used by the theme toggle component).
export { COLOR_SCHEME_KEY };
