import { TextInput, NumberInput, Select } from '@mantine/core';

/**
 * Resolve the choices for a select field (shared option list or inline options).
 */
export function fieldOptions(field, optionLists) {
  if (field.type !== 'select') return [];
  if (field.option_list_id != null) {
    const list = (optionLists || []).find((l) => l.id === field.option_list_id);
    return list ? list.options : [];
  }
  return field.options || [];
}

/**
 * One labeled input for a single field value.
 * onChange always receives the raw value (not a DOM event).
 */
export function ServiceFieldInput({ field, value, onChange, optionLists, lang }) {
  const label = lang === 'ar' ? field.label_ar : field.label_en;

  if (field.type === 'number') {
    return (
      <NumberInput
        label={label}
        required={field.required}
        value={value ?? ''}
        onChange={onChange}
      />
    );
  }

  if (field.type === 'select') {
    const choices = fieldOptions(field, optionLists);
    return (
      <Select
        label={label}
        required={field.required}
        data={choices}
        value={value ?? null}
        onChange={onChange}
        dir="auto"
      />
    );
  }

  // default: text
  return (
    <TextInput
      label={label}
      required={field.required}
      value={value ?? ''}
      onChange={(e) => onChange(e.currentTarget.value)}
      dir="auto"
    />
  );
}
