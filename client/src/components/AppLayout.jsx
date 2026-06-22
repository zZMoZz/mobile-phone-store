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
  Menu,
  Avatar,
  UnstyledButton,
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
  IconLogout,
  IconUser,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n/index.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AccountModal from './AccountModal.jsx';

const COLLAPSE_KEY = 'store.sidebar-collapsed';

// Page content is capped and centered so it doesn't stretch edge-to-edge on
// wide monitors (reduces eye travel). Tables scroll within this width.
const CONTENT_MAX_WIDTH = 1400;

function HeaderControls() {
  const { t, i18n } = useTranslation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { setDirection } = useDirection();
  const { user, logout } = useAuth();
  const [accountOpened, { open: openAccount, close: closeAccount }] = useDisclosure(false);

  // Keep Mantine layout direction in sync with the active language.
  useEffect(() => {
    setDirection(i18n.language === 'ar' ? 'rtl' : 'ltr');
  }, [i18n.language, setDirection]);

  const displayLabel = user?.display_name || user?.username || '';
  const initial = displayLabel[0]?.toUpperCase() ?? '?';

  return (
    <>
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
          <Menu shadow="md" width={180} position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar size="sm" radius="xl" color="blue">{initial}</Avatar>
                  <Text size="sm" visibleFrom="sm">{displayLabel}</Text>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconUser size={14} />} onClick={openAccount}>
                {t('auth.myAccount')}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<IconLogout size={14} />} onClick={logout} color="red">
                {t('auth.logout')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      <AccountModal opened={accountOpened} onClose={closeAccount} />
    </>
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
                    : { label: { fontWeight: 700 } }
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
                    : { label: { fontWeight: 700 } }
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
