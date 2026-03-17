import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:8090/api',
});

export const dockerApi = {
  getStatus: () => api.get('/docker/status').then(res => res.data),
  restart: (id: string) => api.post(`/docker/restart/${id}`).then(res => res.data),
  pull: () => api.post('/docker/pull').then(res => res.data),
};

export const dataApi = {
  generate: () => api.post('/data/generate').then(res => res.data),
  ingest: () => api.post('/data/ingest').then(res => res.data),
};

export const configApi = {
  get: () => api.get('/config').then(res => res.data),
  set: (key: string, value: string) => api.post('/config', { key, value }).then(res => res.data),
};
