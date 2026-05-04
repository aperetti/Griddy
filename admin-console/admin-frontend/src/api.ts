import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL || '/api',
});

export const dataApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/data/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
};

export const configApi = {
  get: () => api.get('/display-rules/overrides').then(res => res.data),
  set: (key: string, value: string) => api.post('/display-rules/overrides', { key, value }).then(res => res.data),
  getAmiAdapters: (): Promise<{ name: string; label: string }[]> =>
    api.get('/display-rules/ami-adapters').then(res => res.data),
  
  // ── Telemetry Config (Observability-as-Code) ──────────────────
  getTelemetryConfig: () => api.get('/display-rules/telemetry-config').then(res => res.data),
  saveTelemetryConfig: (config: any) => api.put('/display-rules/telemetry-config', config).then(res => res.data),

  // ── Infrastructure File Editor (Observability-as-Code) ─────────
  getInfraFiles: (): Promise<string[]> => api.get('/display-rules/infra-files').then(res => res.data),
  getInfraFile: (filename: string): Promise<{ filename: string; content: string }> => 
    api.get(`/display-rules/infra-files/${filename}`).then(res => res.data),
  saveInfraFile: (filename: string, content: string) => 
    api.put(`/display-rules/infra-files/${filename}`, { content }).then(res => res.data),

  // ── Display Profiles ───────────────────────────────────────────
  getDisplayProfiles: (): Promise<any[]> => 
    api.get('/display-rules/configs').then(res => res.data),
    
  activateDisplayProfile: (id: number) => 
    api.put(`/display-rules/configs/${id}/set-default`).then(res => res.data),
    
  deleteDisplayProfile: (id: number) => 
    api.delete(`/display-rules/configs/${id}`).then(res => res.data),
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
