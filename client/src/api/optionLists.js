import api from './client.js';

export async function listOptionLists() {
  const { data } = await api.get('/option-lists');
  return data;
}

export async function createOptionList(body) {
  const { data } = await api.post('/option-lists', body);
  return data;
}

export async function updateOptionList(id, body) {
  const { data } = await api.put(`/option-lists/${id}`, body);
  return data;
}

export async function deleteOptionList(id) {
  await api.delete(`/option-lists/${id}`);
}
