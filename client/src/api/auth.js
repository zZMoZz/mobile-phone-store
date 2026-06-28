import api from './client.js';

export async function loginApi(username, password) {
  const { data } = await api.post('/auth/login', { username, password });
  return data; // { token, user: { id, username, display_name, role, force_password_change } }
}

export async function logoutApi() {
  await api.post('/auth/logout').catch(() => {});
}

export async function getMeApi() {
  const { data } = await api.get('/auth/me');
  return data; // { id, username, display_name, role, force_password_change }
}

export async function forceChangePasswordApi(new_password) {
  const { data } = await api.post('/auth/force-change-password', { new_password });
  return data; // { token, user, recovery_code }
}

export async function changePasswordApi(current_password, new_password) {
  const { data } = await api.post('/auth/change-password', { current_password, new_password });
  return data; // { token, user }
}

export async function verifyPasswordApi(password) {
  const { data } = await api.post('/auth/verify-password', { password });
  return data; // { ok: true }
}

export async function recoverApi(username, recovery_code, new_password) {
  const { data } = await api.post('/auth/recover', { username, recovery_code, new_password });
  return data; // { token, user, recovery_code }
}
