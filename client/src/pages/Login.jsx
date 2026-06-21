import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Center,
  Stack,
  Paper,
  Title,
  TextInput,
  PasswordInput,
  Button,
  Alert,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect away if already logged in
  const from = location.state?.from ?? '/';
  if (user) {
    navigate(from, { replace: true });
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch {
      setError(t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h="100vh">
      <Stack w={360} gap="md">
        <Title order={2} ta="center">
          {t('app.title')}
        </Title>
        <Paper withBorder p="xl" radius="md">
          <form onSubmit={submit}>
            <Stack gap="sm">
              {error && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                  {error}
                </Alert>
              )}
              <TextInput
                label={t('auth.username')}
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                required
                autoFocus
                autoComplete="username"
              />
              <PasswordInput
                label={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                autoComplete="current-password"
              />
              <Button type="submit" fullWidth mt="xs" loading={loading}>
                {t('auth.login')}
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Center>
  );
}
