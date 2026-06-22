import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Center,
  Stack,
  Paper,
  Title,
  Text,
  PasswordInput,
  Button,
  Alert,
  Anchor,
} from '@mantine/core';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import RecoveryCodeModal from '../components/RecoveryCodeModal.jsx';

export default function ForceChangePassword() {
  const { t } = useTranslation();
  const { forceChangePassword, logout } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError(t('errors.auth_password_too_short'));
      return;
    }
    if (newPassword !== confirm) {
      setError(t('auth.passwordMismatch', { defaultValue: 'Passwords do not match' }));
      return;
    }
    setLoading(true);
    try {
      const code = await forceChangePassword(newPassword);
      if (code) {
        setRecoveryCode(code);
        setCodeModalOpen(true);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      setError(code ? t(`errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCodeDismiss = () => {
    setCodeModalOpen(false);
    navigate('/', { replace: true });
  };

  return (
    <>
      <Center h="100vh">
        <Stack w={400} gap="md">
          <Stack align="center" gap="xs">
            <IconLock size={40} stroke={1.5} />
            <Title order={2} ta="center">{t('auth.setNewPassword')}</Title>
            <Text c="dimmed" ta="center" size="sm">
              {t('auth.forceChangeHint', { defaultValue: 'You must set a new password before continuing.' })}
            </Text>
          </Stack>
          <Paper withBorder p="xl" radius="md">
            <form onSubmit={submit}>
              <Stack gap="sm">
                {error && (
                  <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                    {error}
                  </Alert>
                )}
                <PasswordInput
                  label={t('auth.newPassword')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.currentTarget.value)}
                  required
                  autoFocus
                />
                <PasswordInput
                  label={t('auth.confirmPassword', { defaultValue: 'Confirm Password' })}
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                  required
                />
                <Button type="submit" fullWidth mt="xs" loading={loading}>
                  {t('auth.setNewPassword')}
                </Button>
              </Stack>
            </form>
          </Paper>
          <Text ta="center" size="sm">
            <Anchor component="button" type="button" onClick={logout}>
              {t('auth.logout')}
            </Anchor>
          </Text>
        </Stack>
      </Center>
      <RecoveryCodeModal
        code={recoveryCode}
        opened={codeModalOpen}
        onClose={handleCodeDismiss}
      />
    </>
  );
}
