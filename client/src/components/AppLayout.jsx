import { useEffect, useState } from 'react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import {
  AppShell,
  Box,
  Group,
  Title,
  NavLink,
  ActionIcon,
  Select,
  Text,
  Tooltip,
  Burger,
  useMantineColorScheme,
  useDirection,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconLayoutDashboard,
  IconBox,
  IconShoppingCartPlus,
  IconTags,
  IconSettings,
  IconSun,
  IconMoon,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconHistory,
  IconUsers,
  IconLogout,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n/index.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const COLLAPSE_KEY = 'store.sidebar-collapsed';

// Page content is capped and centered so it doesn't stretch edge-to-edge on
// wide monitors (reduces eye travel). Tables scroll within this width.
const CONTENT_MAX_WIDTH = 1400;

function HeaderControls() {
  const { t, i18n } = useTranslation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { setDirection } = useDirection();
  const { user, logout } = useAuth();

  // Keep Mantine layout direction in sync with the active language.
  useEffect(() => {
    setDirection(i18n.language === 'ar' ? 'rtl' : 'ltr');
  }, [i18n.language, setDirection]);

  return (
    <Group gap="sm">
      <Select
        aria-label={t('common.language')}
        size="xs"
        w={120}
        value={i18n.language}
        onChange={(val) => val && setLanguage(val)}
        data={[
          { value: 'ar', label: 'العربية' },
          { value: 'en', label: 'English' },
        ]}
        allowDeselect={false}
      />
      <Tooltip label={t('common.theme')}>
        <ActionIcon variant="default" size="lg" onClick={toggleColorScheme}>
          {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
      </Tooltip>
      {user && (
        <>
          <Text size="sm" c="dimmed">{user.username}</Text>
          <Tooltip label={t('auth.logout')}>
            <ActionIcon variant="default" size="lg" onClick={logout}>
              <IconLogout size={18} />
            </ActionIcon>
          </Tooltip>
        </>
      )}
    </Group>
  );
}

export default function AppLayout({ children }) {
  const { t } = useTranslation();
  const { storeName } = useSettings();
  const location = useLocation();
  const { dir } = useDirection();
  const { isAdmin } = useAuth();

  // Mobile: full show/hide. Desktop: shrink to an icon-only rail (persisted).
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });

  // Collapse the mobile drawer after navigating.
  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  const tooltipSide = dir === 'rtl' ? 'left' : 'right';

  const navItems = [
    { to: '/', key: 'dashboard', icon: IconLayoutDashboard, end: true },
    { to: '/inventory', key: 'inventory', icon: IconBox },
    { to: '/new-transaction', key: 'newTransaction', icon: IconShoppingCartPlus },
    { to: '/lists', key: 'lists', icon: IconTags },
    { to: '/activity-log', key: 'activityLog', icon: IconHistory },
    ...(isAdmin ? [{ to: '/users', key: 'users', icon: IconUsers }] : []),
    { to: '/settings', key: 'settings', icon: IconSettings },
  ];

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: collapsed ? 72 : 240,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            {/* Mobile burger */}
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Title order={3}>{storeName}</Title>
          </Group>
          <HeaderControls />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={collapsed ? 'xs' : 'sm'}>
        <AppShell.Section grow>
          {navItems.map(({ to, key, icon: Icon, end }) => {
            const active = end ? location.pathname === to : location.pathname.startsWith(to);
            const link = (
              <NavLink
                component={RouterNavLink}
                to={to}
                label={collapsed ? undefined : t(`nav.${key}`)}
                leftSection={<Icon size={20} />}
                active={active}
                mb={4}
                styles={
                  collapsed
                    ? { section: { marginInlineEnd: 0 }, body: { display: 'none' } }
                    : undefined
                }
              />
            );
            return collapsed ? (
              <Tooltip key={to} label={t(`nav.${key}`)} position={tooltipSide} withArrow>
                {link}
              </Tooltip>
            ) : (
              <div key={to}>{link}</div>
            );
          })}
        </AppShell.Section>

        {/* Collapse / expand toggle, pinned to the bottom of the sidebar (desktop only) */}
        <AppShell.Section visibleFrom="sm">
          {(() => {
            const toggleLink = (
              <NavLink
                label={collapsed ? undefined : t('common.collapse')}
                onClick={toggleCollapsed}
                leftSection={
                  collapsed ? (
                    <IconLayoutSidebarLeftExpand size={20} />
                  ) : (
                    <IconLayoutSidebarLeftCollapse size={20} />
                  )
                }
                styles={
                  collapsed
                    ? { section: { marginInlineEnd: 0 }, body: { display: 'none' } }
                    : undefined
                }
              />
            );
            return collapsed ? (
              <Tooltip label={t('common.expand')} position={tooltipSide} withArrow>
                {toggleLink}
              </Tooltip>
            ) : (
              toggleLink
            );
          })()}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Box maw={CONTENT_MAX_WIDTH} mx="auto">
          {children}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
