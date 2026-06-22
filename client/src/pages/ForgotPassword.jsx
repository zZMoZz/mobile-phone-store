import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Center,
  Stack,
  Paper,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Anchor,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { recoverApi } from '../api/auth.js';
import RecoveryCodeModal from '../components/RecoveryCodeModal.jsx';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError(t('errors.auth_password_too_short'));
      return;
    }
    setLoading(true);
    try {
      const { recovery_code } = await recoverApi(username.trim(), recoveryCode.trim(), newPassword);
      setNewCode(recovery_code);
      setCodeModalOpen(true);
    } catch (err) {
      const code = err.response?.data?.code;
      setError(code ? t(`errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCodeDismiss = () => {
    setCodeModalOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <>
      <Center h="100vh">
        <Stack w={400} gap="md">
          <Title order={2} ta="center">{t('auth.recoverTitle')}</Title>
          <Paper withBorder p="xl" radius="md">
            <form onSubmit={submit}>
              <Stack gap="sm">
                {error && (
                  <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                    {error}
                  </Alert>
                )}
                <Text size="sm" c="dimmed">{t('auth.recoverHint')}</Text>
                <TextInput
                  label={t('auth.username')}
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  required
                  autoFocus
                />
                <TextInput
                  label={t('auth.recoveryCode')}
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.currentTarget.value)}
                  required
                  autoComplete="off"
                  styles={{ input: { fontFamily: 'monospace', letterSpacing: '0.1em' } }}
                />
                <PasswordInput
                  label={t('auth.newPassword')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.currentTarget.value)}
                  required
                />
                <Button type="submit" fullWidth mt="xs" loading={loading}>
                  {t('auth.setNewPassword')}
                </Button>
                <Anchor component={Link} to="/login" ta="center" size="sm">
                  {t('auth.login')}
                </Anchor>
              </Stack>
            </form>
          </Paper>
        </Stack>
      </Center>
      <RecoveryCodeModal
        code={newCode}
        opened={codeModalOpen}
        onClose={handleCodeDismiss}
      />
    </>
  );
}
