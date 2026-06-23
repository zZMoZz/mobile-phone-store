import api from './client.js';

export async function listProducts(params) {
  const { data } = await api.get('/products', { params });
  return data;
}

export async function getProduct(id) {
  const { data } = await api.get(`/products/${id}`);
  return data;
}

export async function getSummary(params) {
  const { data } = await api.get('/products/summary', { params });
  return data;
}

export async function lookupByBarcode(barcode) {
  const { data } = await api.get('/products/lookup', { params: { barcode } });
  return data;
}

export async function searchProducts(q) {
  const { data } = await api.get('/products/search', { params: { q } });
  return data;
}

export async function createProduct(body) {
  const { data } = await api.post('/products', body);
  return data;
}

export async function addStock(body) {
  const { data } = await api.post('/products/add-stock', body);
  return data;
}

export async function restock(id, quantity, unitCost) {
  const { data } = await api.post(`/products/${id}/add-stock`, { quantity, unit_cost: unitCost });
  return data;
}

export async function updateProduct(id, body) {
  const { data } = await api.put(`/products/${id}`, body);
  return data;
}

export async function deleteProduct(id) {
  await api.delete(`/products/${id}`);
}

export async function uploadProductImage(id, file) {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.post(`/products/${id}/image`, form);
  return data;
}
