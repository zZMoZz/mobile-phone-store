import { Modal, Stack, Text, Code, Button, Alert, Group, CopyButton, ActionIcon, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCopy, IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export default function RecoveryCodeModal({ code, opened, onClose }) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={() => {}} // prevent closing by ESC or outside click
      title={t('auth.recoveryCodeTitle')}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
    >
      <Stack gap="md">
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
          {t('auth.recoveryCodeWarning')}
        </Alert>
        <Stack gap="xs">
          <Text size="sm" fw={500}>{t('auth.recoveryCode')}</Text>
          <Group gap="xs" align="center">
            <Code fz="lg" style={{ letterSpacing: '0.15em', flex: 1, textAlign: 'center', padding: '12px' }}>
              {code}
            </Code>
            <CopyButton value={code ?? ''} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t('auth.recoveryCodeCopied') : t('common.copy', { defaultValue: 'Copy' })} withArrow>
                  <ActionIcon color={copied ? 'teal' : 'blue'} variant="light" size="lg" onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        </Stack>
        <Group justify="flex-end">
          <Button onClick={onClose}>
            {t('common.close')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
