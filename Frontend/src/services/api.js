import axios from 'axios';
const TOKEN_KEY = 'sitepass:admin-token';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api', timeout: 15000, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => { const token = sessionStorage.getItem(TOKEN_KEY); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use((response) => response, (error) => { if (error.response?.status === 401) { sessionStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event('sitepass:unauthorized')); } return Promise.reject(error); });
export const apiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => error?.response?.data?.message || error?.message || fallback;

// Proposed backend contracts. Demo mode uses mockService/store until the API is available.
export const verificationApi = {
  getSite: (siteCode) => api.get(`/public/sites/${encodeURIComponent(siteCode)}`).then((response) => ({ ...response, data: response.data?.data || response.data?.site || response.data })),
  verifyLocation: (payload) => { const match = window.location.pathname.match(/\/verify\/[^/]+\/(entry|exit)(?:\/|$)/i); return api.post('/public/location/verify', { ...payload, ...(match ? { action: match[1].toUpperCase() } : {}) }); },
  verifyAttendance: (payload) => api.post('/public/attendance/verify', payload),
  verifyAttendanceEntry: (payload) => api.post('/public/attendance/entry', payload),
  verifyAttendanceExit: (payload) => api.post('/public/attendance/exit', payload),
  submitSafetyDeclaration: (payload) => api.post('/public/attendance/safety-declarations', payload),
  adminLogin: (payload) => api.post('/admin/auth/login', payload),
  listEmployees: (siteCode) => api.get('/admin/employees', { params: { siteCode: siteCode || import.meta.env.VITE_DEFAULT_SITE_CODE || 'SITE-CMB-01' } }),
  getEmployee: (employeeId) => api.get(`/admin/employees/${encodeURIComponent(employeeId)}`),
  createEmployee: (payload, idempotencyKey) => api.post('/admin/employees', payload, { headers: { 'Idempotency-Key': idempotencyKey } }),
  updateEmployee: (employeeId, payload) => api.patch(`/admin/employees/${encodeURIComponent(employeeId)}`, payload),
  updateEmployeeStatus: (employeeId, isActive) => api.patch(`/admin/employees/${encodeURIComponent(employeeId)}/status`, { isActive }),
  regenerateEmployeeAccessCode: (employeeId) => api.post(`/admin/employees/${encodeURIComponent(employeeId)}/access-code/regenerate`),
  listAttendance: (params) => api.get('/admin/attendance', { params }),
  attendanceSummary: (params) => api.get('/admin/attendance/summary', { params }),
  getAttendanceSafety: (attendanceId) => api.get(`/admin/attendance/${encodeURIComponent(attendanceId)}/safety`),
  exportAttendance: (params) => api.get('/admin/attendance/export', { params, responseType: params.format === 'pdf' ? 'blob' : 'text' }),
  registerVisitor: (payload, config) => api.post('/public/visitors/register', payload, config),
  visitorCheckIn: (payload) => api.post('/public/visitors/check-in', payload),
  visitorCheckOut: (payload) => api.post('/public/visitors/check-out', payload),
  listVisitors: (params) => api.get('/admin/visitors', { params }),
  getVisitor: (visitId) => api.get(`/admin/visitors/${encodeURIComponent(visitId)}`),
  revokeVisitor: (visitId) => api.post(`/admin/visitors/${encodeURIComponent(visitId)}/revoke`),
  regenerateVisitorAccessCode: (visitId) => api.post(`/admin/visitors/${encodeURIComponent(visitId)}/access-code/regenerate`),
  updateVisitorApproval: (visitId, status) => api.patch(`/admin/visitors/${encodeURIComponent(visitId)}/approval`, { status }),
  listSites: () => api.get('/admin/sites'),
  getAdminSite: (siteId) => api.get(`/admin/sites/${encodeURIComponent(siteId)}`),
  createSite: (payload) => api.post('/admin/sites', payload),
  updateSite: (siteId, payload) => api.patch(`/admin/sites/${encodeURIComponent(siteId)}`, payload),
  updateSiteStatus: (siteId, isActive) => api.patch(`/admin/sites/${encodeURIComponent(siteId)}/status`, { isActive }),
  getDashboard: () => api.get('/admin/dashboard'),
  listAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  exportAuditLogs: (params) => api.get('/admin/audit-logs', { params: { ...params, export: 'csv' }, responseType: 'blob' }),
};
export { TOKEN_KEY };
