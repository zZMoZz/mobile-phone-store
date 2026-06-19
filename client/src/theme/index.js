import { createTheme } from '@mantine/core';

// Shared Mantine theme. Color scheme (light/dark) is handled by MantineProvider's
// defaultColorScheme + useMantineColorScheme hook, persisted to localStorage.
export const theme = createTheme({
  primaryColor: 'indigo',
  fontFamily:
    'Segoe UI, Tahoma, "Noto Sans Arabic", system-ui, -apple-system, sans-serif',
  defaultRadius: 'md',
  colors: {
    // Dark palette overridden so the global dark background is rgb(20,20,20).
    // dark[7] is the body background; dark[6] is elevated surfaces (cards,
    // inputs) kept a touch lighter for depth. Lighter shades (text/borders)
    // keep Mantine's defaults.
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33',
      '#242424',
      '#141414',
      '#101010',
      '#0A0A0A',
    ],
  },
});

export const COLOR_SCHEME_KEY = 'store.color-scheme';
