import api from './client.js';

export async function listUsers() {
  const { data } = await api.get('/users');
  return data;
}

export async function createUser(body) {
  const { data } = await api.post('/users', body);
  return data;
}

export async function updateUser(id, body) {
  const { data } = await api.put(`/users/${id}`, body);
  return data;
}

export async function deleteUser(id) {
  await api.delete(`/users/${id}`);
}
