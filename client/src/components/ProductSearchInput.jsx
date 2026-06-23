import { forwardRef, useRef, useState } from 'react';
import { Combobox, TextInput, Loader, Group, Text, Badge, useCombobox } from '@mantine/core';
import { IconBarcode } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { searchProducts } from '../api/products.js';

/**
 * Barcode/name search input for the transaction form.
 * - Typing shows async product suggestions from the API (min 2 chars).
 * - Clicking a suggestion calls onProductSelect(product) directly.
 * - Pressing Enter calls onScan(value) for the scanner / exact-match path.
 * - Forwards ref to the underlying TextInput for focus management.
 */
const ProductSearchInput = forwardRef(function ProductSearchInput(
  { onScan, onProductSelect, placeholder, ...props },
  ref
) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const [value, setValue] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  // Set to true inside onOptionSubmit so the deferred Enter handler knows
  // the dropdown already consumed the key and skips calling onScan.
  const optionSubmittedRef = useRef(false);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const fetchSuggestions = (query) => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (query.trim().length < 2) {
      setResults([]);
      combobox.closeDropdown();
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      searchProducts(query.trim())
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data);
          if (data.length > 0) combobox.openDropdown();
          else combobox.closeDropdown();
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
  };

  const reset = () => {
    setValue('');
    setResults([]);
    setLoading(false);
    combobox.closeDropdown();
    abortRef.current?.abort();
    clearTimeout(debounceRef.current);
  };

  const handleOptionSubmit = (productId) => {
    const product = results.find((p) => String(p.id) === productId);
    if (product) {
      optionSubmittedRef.current = true;
      onProductSelect(product);
      reset();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = value.trim();
      if (!code) return;
      // Defer so Mantine's own keydown handler (which fires onOptionSubmit for a
      // highlighted option) runs first. If it did, skip calling onScan.
      setTimeout(() => {
        if (optionSubmittedRef.current) {
          optionSubmittedRef.current = false;
          return;
        }
        reset();
        onScan(code);
      }, 0);
    } else if (e.key === 'Escape') {
      combobox.closeDropdown();
    }
  };

  return (
    <Combobox store={combobox} onOptionSubmit={handleOptionSubmit} withinPortal>
      <Combobox.Target>
        <TextInput
          ref={ref}
          leftSection={<IconBarcode size={18} />}
          rightSection={loading ? <Loader size={14} /> : null}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value);
            fetchSuggestions(e.currentTarget.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => combobox.closeDropdown()}
          {...props}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={results.length === 0}>
        <Combobox.Options>
          {results.map((p) => (
            <Combobox.Option key={p.id} value={String(p.id)}>
              <Group justify="space-between" gap="xs" wrap="nowrap">
                <div>
                  <Text size="sm" fw={500}>{p.name}</Text>
                  {p.barcode && (
                    <Text size="xs" c="dimmed">{p.barcode}</Text>
                  )}
                </div>
                <Badge
                  size="xs"
                  variant="light"
                  color={p.quantity > 0 ? 'teal' : 'gray'}
                  style={{ flexShrink: 0 }}
                >
                  {lang === 'ar' ? p.quantity : p.quantity}
                </Badge>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
});

export default ProductSearchInput;
