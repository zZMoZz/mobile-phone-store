import api from './client.js';

export async function getAnalytics(params) {
  const { data } = await api.get('/analytics', { params });
  return data;
}
