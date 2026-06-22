import api from './client.js';

export async function listUsers() {
  const { data } = await api.get('/users');
  return data;
}

export async function createUser(body) {
  // body: { username, display_name?, password, role }
  const { data } = await api.post('/users', body);
  return data;
}

export async function updateUser(id, body) {
  // body: partial { display_name?, role?, status?, password? }
  const { data } = await api.put(`/users/${id}`, body);
  return data;
}
