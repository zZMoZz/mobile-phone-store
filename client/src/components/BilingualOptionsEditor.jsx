import { Group, Stack, Text, TextInput, ActionIcon, Button } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export default function BilingualOptionsEditor({ value = [], onChange, error }) {
  const { t } = useTranslation();

  const add = () => onChange([...value, { name_en: '', name_ar: '' }]);
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const set = (i, key, v) => {
    const next = [...value];
    next[i] = { ...next[i], [key]: v };
    onChange(next);
  };

  return (
    <Stack gap="xs">
      {value.length > 0 && (
        <Group gap="xs">
          <Text size="xs" fw={500} style={{ flex: 1 }}>{t('services.nameEn')}</Text>
          <Text size="xs" fw={500} style={{ flex: 1 }}>{t('services.nameAr')}</Text>
          <div style={{ width: 28 }} />
        </Group>
      )}
      {value.map((opt, i) => (
        <Group key={i} align="center" gap="xs">
          <TextInput
            value={opt.name_en || ''}
            onChange={(e) => set(i, 'name_en', e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <TextInput
            dir="auto"
            value={opt.name_ar || ''}
            onChange={(e) => set(i, 'name_ar', e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <ActionIcon color="red" variant="subtle" onClick={() => remove(i)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
      {error && <Text size="xs" c="red">{error}</Text>}
      <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={add} style={{ alignSelf: 'flex-start' }}>
        {t('lists.addOption')}
      </Button>
    </Stack>
  );
}
