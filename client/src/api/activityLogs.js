import api from './client.js';

export async function listActivityLogs(params) {
  const { data } = await api.get('/activity-logs', { params });
  return data;
}
