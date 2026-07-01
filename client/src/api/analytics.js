import api from './client.js';

export async function getAnalytics(params) {
  const { data } = await api.get('/analytics', { params });
  return data;
}

export async function getLowStock(params) {
  const { data } = await api.get('/analytics/low-stock', { params });
  return data;
}
