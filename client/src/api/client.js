import axios from 'axios';

// Same-origin in production (Express serves the client); proxied in dev by Vite.
const api = axios.create({
  baseURL: '/api',
});

export default api;
