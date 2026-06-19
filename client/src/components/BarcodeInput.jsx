import { useState } from 'react';
import { TextInput } from '@mantine/core';
import { IconBarcode } from '@tabler/icons-react';

/**
 * Text field tuned for keyboard-wedge barcode scanners: the scanner types the
 * code then sends Enter, which fires onScan(value) and clears the field.
 * Also usable by hand. `autoFocus` keeps it ready for the next scan.
 */
export default function BarcodeInput({ onScan, placeholder, autoFocus = true, ...props }) {
  const [value, setValue] = useState('');

  const submit = () => {
    const code = value.trim();
    if (code) onScan(code);
    setValue('');
  };

  return (
    <TextInput
      leftSection={<IconBarcode size={18} />}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      }}
      {...props}
    />
  );
}
