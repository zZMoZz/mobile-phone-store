import api from './client.js';

export async function getSettings() {
  const { data } = await api.get('/settings');
  return data;
}

export async function updateSettings(body) {
  const { data } = await api.put('/settings', body);
  return data;
}

export async function createBackup() {
  const { data } = await api.post('/backup');
  return data;
}

// CSV exports are plain downloads; build absolute URLs for <a href> / window.open.
export const exportProductsUrl = '/api/export/products.csv';
export const exportTransactionsUrl = '/api/export/transactions.csv';
