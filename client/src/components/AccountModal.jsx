import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Divider,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';

export default function AccountModal({ opened, onClose }) {
  const { t } = useTranslation();
  const { user, changePassword, updateUserInContext } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (opened) {
      setDisplayName(user?.display_name || '');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwError('');
    }
  }, [opened, user]);

  const saveDisplayName = async () => {
    setSavingName(true);
    try {
      await updateUserInContext(user.id, { display_name: displayName.trim() || null });
      notifications.show({ message: t('common.saved'), color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (newPw.length < 6) {
      setPwError(t('errors.auth_password_too_short'));
      return;
    }
    if (newPw !== confirmPw) {
      setPwError(t('auth.passwordMismatch'));
      return;
    }
    setSavingPw(true);
    try {
      await changePassword(currentPw, newPw);
      notifications.show({ message: t('auth.passwordUpdated'), color: 'green' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      onClose();
    } catch (err) {
      const code = err.response?.data?.code;
      notifications.show({
        message: code ? t(`errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'),
        color: 'red',
      });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('auth.myAccount')}>
      <Stack gap="md">
        <Stack gap="xs">
          <Text fw={500} size="sm">{t('users.displayName')}</Text>
          <TextInput
            placeholder={user?.username}
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            description={t('users.displayNameHint')}
          />
          <Group justify="flex-end">
            <Button size="sm" loading={savingName} onClick={saveDisplayName}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>

        <Divider label={t('auth.changePassword')} labelPosition="center" />

        <Stack gap="xs">
          <PasswordInput
            label={t('auth.currentPassword')}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.currentTarget.value)}
          />
          <PasswordInput
            label={t('auth.newPassword')}
            value={newPw}
            onChange={(e) => setNewPw(e.currentTarget.value)}
          />
          <PasswordInput
            label={t('auth.confirmPassword')}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.currentTarget.value)}
            error={pwError}
          />
          <Group justify="flex-end">
            <Button
              size="sm"
              loading={savingPw}
              onClick={handleChangePassword}
              disabled={!currentPw || !newPw || !confirmPw}
            >
              {t('auth.changePassword')}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Modal>
  );
}
