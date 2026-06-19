import api from './client.js';

export async function listServiceTypes() {
  const { data } = await api.get('/service-types');
  return data;
}

export async function createServiceType(body) {
  const { data } = await api.post('/service-types', body);
  return data;
}

export async function updateServiceType(id, body) {
  const { data } = await api.put(`/service-types/${id}`, body);
  return data;
}

export async function deleteServiceType(id) {
  await api.delete(`/service-types/${id}`);
}
