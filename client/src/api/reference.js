import api from './client.js';

export async function listCategories() {
  const { data } = await api.get('/categories');
  return data;
}

export async function listBrands() {
  const { data } = await api.get('/brands');
  return data;
}

export async function createCategory(body) {
  const { data } = await api.post('/categories', body);
  return data;
}

export async function updateCategory(id, body) {
  const { data } = await api.put(`/categories/${id}`, body);
  return data;
}

export async function deleteCategory(id, moveTo) {
  await api.delete(`/categories/${id}`, { params: moveTo != null ? { moveTo } : {} });
}

export async function createBrand(body) {
  const { data } = await api.post('/brands', body);
  return data;
}

export async function updateBrand(id, body) {
  const { data } = await api.put(`/brands/${id}`, body);
  return data;
}

export async function deleteBrand(id, moveTo) {
  await api.delete(`/brands/${id}`, { params: moveTo != null ? { moveTo } : {} });
}
