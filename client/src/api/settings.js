import api from './client.js';

export async function getSettings() {
  const { data } = await api.get('/settings');
  return data;
}

export async function updateSettings(body) {
  const { data } = await api.put('/settings', body);
  return data;
}

export async function createBackup(dir) {
  const { data } = await api.post('/backup', dir ? { dir } : {});
  return data;
}

export async function pickFolder() {
  const { data } = await api.get('/settings/folder-picker');
  return data.path; // string or null if cancelled
}

export async function exportCsv(path) {
  const { data } = await api.get(path, { responseType: 'blob' });
  return data;
}
