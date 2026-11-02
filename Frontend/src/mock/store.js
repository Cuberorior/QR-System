import { format } from 'date-fns';

const today = format(new Date(), 'yyyy-MM-dd');
export const mockStore = {
  sites: [{ id: 'SITE-CMB-01', name: 'Colombo Construction Site', location: 'Union Place, Colombo 02', status: 'Active', administrator: 'Amara Perera', latitude: 6.9147, longitude: 79.8731, radius: 150, geofencingEnabled: true, brandColor: '#102a56' }],
  employees: [
    { id: 'EMP001', name: 'John Silva', phone: '+94 77 234 5678', siteId: 'SITE-CMB-01', status: 'Active', accessCode: '2580' },
    { id: 'EMP002', name: 'Nimal Perera', phone: '+94 71 558 1020', siteId: 'SITE-CMB-01', status: 'Active', accessCode: '4826' },
    { id: 'EMP003', name: 'Kasun Fernando', phone: '+94 76 903 4112', siteId: 'SITE-CMB-01', status: 'Inactive', accessCode: '7314' },
  ],
  attendance: [
    { id: 'att-1', employeeId: 'EMP002', employeeName: 'Nimal Perera', siteId: 'SITE-CMB-01', entryDate: today, entryTime: '07:42 AM', exitTime: null, status: 'Present' },
    { id: 'att-2', employeeId: 'EMP001', employeeName: 'John Silva', siteId: 'SITE-CMB-01', entryDate: today, entryTime: '08:05 AM', exitTime: '05:18 PM', status: 'Completed' },
  ],
  visitors: [{ id: 'VIS-2048', name: 'Sanjay Wijesinghe', phone: '+94 75 442 1900', organization: 'BuildRight Supplies', purpose: 'Material delivery', siteId: 'SITE-CMB-01', registeredAt: 'Today, 09:12 AM', approval: 'Pending Approval', departure: null }],
  administrators: [{ id: 'ADM-001', name: 'Amara Perera', email: 'amara@sitepass.lk', role: 'ADMIN', status: 'Active', siteId: 'SITE-CMB-01' }],
};

const wait = (value, ms = 320) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
export const mockApi = {
  getSite: (id) => wait(mockStore.sites.find((site) => site.id === id) || null),
  getSites: () => wait([...mockStore.sites]),
  getGeofence: (id) => wait(mockStore.sites.find((site) => site.id === id) || null),
  updateGeofence: async (id, changes) => { const site = mockStore.sites.find((item) => item.id === id); if (!site) throw new Error('Invalid construction site.'); Object.assign(site, changes); return wait({ ...site }); },
  verifyLocation: async ({ siteId, demoScenario = 'inside' }) => {
    const site = mockStore.sites.find((item) => item.id === siteId);
    if (!site) throw Object.assign(new Error('This construction site is invalid.'), { code: 'INVALID_SITE' });
    if (demoScenario === 'denied') throw Object.assign(new Error('Location permission was denied. Enable location access in your browser settings and try again.'), { code: 'PERMISSION_DENIED' });
    if (demoScenario === 'unavailable') throw Object.assign(new Error('Your device could not determine a location. Try again in an open area.'), { code: 'POSITION_UNAVAILABLE' });
    if (demoScenario === 'timeout') throw Object.assign(new Error('GPS timed out. Please request a fresh location reading.'), { code: 'TIMEOUT' });
    if (demoScenario === 'poor') throw Object.assign(new Error('Location accuracy is insufficient. Please try again with GPS enabled.'), { code: 'POOR_ACCURACY' });
    if (demoScenario === 'outside') throw Object.assign(new Error('You are outside the permitted construction site area.'), { code: 'OUTSIDE_RADIUS', distance: 840 });
    return wait({ allowed: true, status: 'verified', siteId, session: `demo-session-${Date.now()}`, expiresAt: Date.now() + 10 * 60 * 1000, distance: 42, accuracy: 18 });
  },
  getDashboard: () => wait({ employees: mockStore.employees.length, present: mockStore.attendance.filter((a) => a.status === 'Present').length, entries: mockStore.attendance.length, exits: mockStore.attendance.filter((a) => a.exitTime).length, visitors: mockStore.visitors.length, incomplete: mockStore.attendance.filter((a) => !a.exitTime).length }),
  getEmployees: () => wait([...mockStore.employees]),
  getAttendance: () => wait([...mockStore.attendance]),
  getVisitors: () => wait([...mockStore.visitors]),
  verifyEmployee: async ({ siteId, credential, verificationSession }) => {
    if (!verificationSession || verificationSession.expiresAt < Date.now()) throw new Error('Your location verification has expired. Please verify your location again.');
    const employee = mockStore.employees.find((item) => item.siteId === siteId && item.status === 'Active' && (item.id.toLowerCase() === credential.toLowerCase() || item.accessCode === credential));
    if (!employee) throw new Error('We could not verify that employee ID or access code.');
    const open = mockStore.attendance.find((item) => item.employeeId === employee.id && item.status === 'Present');
    const now = format(new Date(), 'hh:mm a');
    if (open) { open.exitTime = now; open.status = 'Completed'; return wait({ type: 'exit', eventTime: now, employee, attendance: open }); }
    const record = { id: `att-${Date.now()}`, employeeId: employee.id, employeeName: employee.name, siteId, entryDate: today, entryTime: now, exitTime: null, status: 'Present' };
    mockStore.attendance.unshift(record);
    return wait({ type: 'entry', eventTime: now, employee, attendance: record });
  },
  registerVisitor: async (data) => { if (!data.verificationSession || data.verificationSession.expiresAt < Date.now()) throw new Error('Your location verification has expired. Please verify your location again.'); const visitor = { ...data, id: `VIS-${Math.floor(1000 + Math.random() * 8999)}`, siteId: data.siteId, registeredAt: format(new Date(), "MMM d, yyyy, hh:mm a"), approval: 'Pending Approval', departure: null }; delete visitor.verificationSession; mockStore.visitors.unshift(visitor); return wait(visitor); },
  approveVisitor: async (id, approval) => { const visitor = mockStore.visitors.find((item) => item.id === id); if (visitor) visitor.approval = approval; return wait(visitor); },
  login: async ({ email, password }) => { if (email === 'admin@sitepass.lk' && password === 'demo1234') return wait(mockStore.administrators[0]); throw new Error('Invalid demo credentials. Try admin@sitepass.lk / demo1234'); },
};
