import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL || 'http://127.0.0.1:8000/api',
});

export const dataApi = {
  generate: () => api.post('/data/generate').then(res => res.data),
  ingest: () => api.post('/data/ingest').then(res => res.data),
};

export const configApi = {
  get: () => api.get('/config').then(res => res.data),
  set: (key: string, value: string) => api.post('/config', { key, value }).then(res => res.data),
};
