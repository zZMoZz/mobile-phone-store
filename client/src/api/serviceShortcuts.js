import api from './client.js';

export async function listServiceShortcuts(serviceId) {
  const { data } = await api.get('/service-shortcuts', { params: serviceId != null ? { service_id: serviceId } : {} });
  return data;
}

export async function createServiceShortcut(body) {
  const { data } = await api.post('/service-shortcuts', body);
  return data;
}

export async function updateServiceShortcut(id, body) {
  const { data } = await api.put(`/service-shortcuts/${id}`, body);
  return data;
}

export async function deleteServiceShortcut(id) {
  await api.delete(`/service-shortcuts/${id}`);
}
