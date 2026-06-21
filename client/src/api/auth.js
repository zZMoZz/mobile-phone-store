import api from './client.js';

export async function loginApi(username, password) {
  const { data } = await api.post('/auth/login', { username, password });
  return data; // { token, user: { id, username, role } }
}

export async function logoutApi() {
  await api.post('/auth/logout').catch(() => {});
}

export async function getMeApi() {
  const { data } = await api.get('/auth/me');
  return data; // { id, username, role }
}
