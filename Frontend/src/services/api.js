import axios from 'axios';
import { mockApi, mockStore } from '../mock/store';
import { DEMO_MODE } from './demoMode';
const TOKEN_KEY = 'sitepass:admin-token';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api', timeout: 15000, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => { const token = sessionStorage.getItem(TOKEN_KEY); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use((response) => response, (error) => { if (error.response?.status === 401) { sessionStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event('sitepass:unauthorized')); } return Promise.reject(error); });
export const apiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => error?.response?.data?.message || error?.message || fallback;

// Proposed backend contracts. Demo mode uses mockService/store until the API is available.
export const verificationApi = {
  getSite: (siteCode) => DEMO_MODE ? mockApi.getSite(siteCode).then(site => ({ data: site })) : api.get(`/public/sites/${encodeURIComponent(siteCode)}`).then((response) => ({ ...response, data: response.data?.data || response.data?.site || response.data })),
  verifyLocation: (payload) => { const match = window.location.pathname.match(/\/verify\/[^/]+\/(entry|exit)(?:\/|$)/i); return DEMO_MODE ? mockApi.verifyLocation({ siteId: payload.siteCode }).then(result => ({ data: { verificationToken: result.session, expiresAt: result.expiresAt, distanceMeters: result.distance, demo: true } })) : api.post('/public/location/verify', { ...payload, ...(match ? { action: match[1].toUpperCase() } : {}) }); },
  verifyAttendance: (payload) => DEMO_MODE ? demoAttendance(payload) : api.post('/public/attendance/verify', payload),
  verifyAttendanceEntry: (payload) => DEMO_MODE ? demoAttendance(payload) : api.post('/public/attendance/entry', payload),
  verifyAttendanceExit: (payload) => DEMO_MODE ? demoAttendance(payload) : api.post('/public/attendance/exit', payload),
  submitSafetyDeclaration: (payload) => DEMO_MODE ? Promise.resolve({ data: { submitted: true, demo: true } }) : api.post('/public/attendance/safety-declarations', payload),
  adminLogin: (payload) => DEMO_MODE ? mockApi.login(payload).then(user => ({ data: { administrator: user } })) : api.post('/admin/auth/login', payload),
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
  registerVisitor: (payload, config) => DEMO_MODE ? mockApi.registerVisitor({ ...payload, verificationSession: { expiresAt: Date.now() + 600000 } }).then(visitor => { sessionStorage.setItem('sitepass:lastVisitor', JSON.stringify(visitor)); return { data: { message: 'Demo visitor registration complete.', visit: visitor } }; }) : api.post('/public/visitors/register', payload, config),
  visitorCheckIn: (payload) => DEMO_MODE ? updateDemoVisitor('CHECKED_IN') : api.post('/public/visitors/check-in', payload),
  visitorCheckOut: (payload) => DEMO_MODE ? updateDemoVisitor('CHECKED_OUT') : api.post('/public/visitors/check-out', payload),
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
  listAuditLogs: (params) => DEMO_MODE ? Promise.resolve({ data: { logs: mockStore.activityLogs || [], pagination: { page: 1, pageSize: params?.pageSize || 25, total: (mockStore.activityLogs || []).length, totalPages: 1 } } }) : api.get('/admin/audit-logs', { params }),
  exportAuditLogs: (params) => DEMO_MODE ? Promise.resolve({ data: new Blob(['Date,Actor,Activity\nToday,Amara Perera,Demo activity\n'], { type: 'text/csv' }) }) : api.get('/admin/audit-logs', { params: { ...params, export: 'csv' }, responseType: 'blob' }),
};
const demoAttendance = (payload) => mockApi.verifyEmployee({ siteId: payload.siteCode, credential: payload.employeeCode || '', verificationSession: { expiresAt: Date.now() + 600000 } }).then(result => ({ data: { ...result, demo: true } }));
const updateDemoVisitor = (status) => { const visitor = JSON.parse(sessionStorage.getItem('sitepass:lastVisitor') || 'null'); if (!visitor) return Promise.reject(new Error('Visitor registration not found.')); visitor.visitStatus = status; visitor.approvalStatus = 'APPROVED'; sessionStorage.setItem('sitepass:lastVisitor', JSON.stringify(visitor)); return Promise.resolve({ data: { visit: visitor, demo: true } }); };
export { TOKEN_KEY };
