import api from './client.js';

export async function listTransactions(params) {
  const { data } = await api.get('/transactions', { params });
  return data;
}

export async function getTransaction(id) {
  const { data } = await api.get(`/transactions/${id}`);
  return data;
}

export async function createTransaction(body) {
  const { data } = await api.post('/transactions', body);
  return data;
}
