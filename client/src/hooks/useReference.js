import { useState, useEffect, useCallback } from 'react';
import { listCategories, listBrands } from '../api/reference.js';

/** Loads categories and brands once; exposes them plus a reload function. */
export function useReference() {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  const reload = useCallback(async () => {
    const [c, b] = await Promise.all([listCategories(), listBrands()]);
    setCategories(c);
    setBrands(b);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { categories, brands, reload };
}
