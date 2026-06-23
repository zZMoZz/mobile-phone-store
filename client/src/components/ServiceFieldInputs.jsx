import { TextInput, NumberInput, Select } from '@mantine/core';

/**
 * Resolve the choices for a select field as Mantine Select data ({value, label}).
 * value = name_en (stable canonical key); label = localized display name.
 */
export function fieldOptions(field, optionLists, lang = 'en') {
  if (field.type !== 'select') return [];
  let opts;
  if (field.option_list_id != null) {
    const list = (optionLists || []).find((l) => l.id === field.option_list_id);
    opts = list ? list.options : [];
  } else {
    opts = field.options || [];
  }
  return opts.map((o) => {
    if (typeof o === 'string') return { value: o, label: o };
    return { value: o.name_en, label: lang === 'ar' ? o.name_ar : o.name_en };
  });
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
    const choices = fieldOptions(field, optionLists, lang);
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
