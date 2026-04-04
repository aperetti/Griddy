import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL || '/api',
});

export const dataApi = {
  generate: () => api.post('/data/generate').then(res => res.data),
  ingest: () => api.post('/data/ingest').then(res => res.data),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/data/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
};

export const configApi = {
  get: () => api.get('/config').then(res => res.data),
  set: (key: string, value: string) => api.post('/config', { key, value }).then(res => res.data),
  
  // ── Display Profiles ───────────────────────────────────────────
  getDisplayProfiles: (): Promise<any[]> => 
    api.get('/config/display-profiles').then(res => res.data),
    
  activateDisplayProfile: (id: number) => 
    api.post(`/config/display-profiles/${id}/activate`).then(res => res.data),
    
  deleteDisplayProfile: (id: number) => 
    api.delete(`/config/display-profiles/${id}`).then(res => res.data),
};

export const pluginsApi = {
  getRegistry: (): Promise<{ name: string; enabled: boolean; description?: string; permissions?: string[] }[]> =>
    api.get('/plugins').then(res => res.data),
  setEnabled: (name: string, enabled: boolean) =>
    api.put(`/plugins/${name}/enabled`, { enabled }).then(res => res.data),
};

export const usersApi = {
  get: () => api.get('/users').then(res => res.data),
  set: (username: string, password?: string) => api.post('/users', { username, password }).then(res => res.data),
  delete: (username: string) => api.delete(`/users/${username}`).then(res => res.data),
};
