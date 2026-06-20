import api from './client.js';

export async function listServices() {
  const { data } = await api.get('/services');
  return data;
}

export async function createService(body) {
  const { data } = await api.post('/services', body);
  return data;
}

export async function updateService(id, body) {
  const { data } = await api.put(`/services/${id}`, body);
  return data;
}

export async function deleteService(id) {
  await api.delete(`/services/${id}`);
}
