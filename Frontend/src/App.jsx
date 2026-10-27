import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import VerificationGate from './pages/public/VerificationGateGps';
import VerificationSuccess from './pages/public/VerificationSuccessReal';
import VisitorStatus from './pages/public/VisitorAccess';
import EmployeeVerificationSecure from './pages/public/EmployeeSafetyVerification';
import VerificationAction from './pages/public/VerificationAction';
import EmployeeActionVerification from './pages/public/EmployeeActionVerification';
import EmployeeActionWorkflow from './pages/public/EmployeeActionWorkflow';
import VisitorAction from './pages/public/VisitorAction';
import LegacyEmployeeNotice from './pages/public/LegacyEmployeeNotice';
import QRCodesSecure from './pages/admin/QRCodesTwoPerSite';
import VisitorRegistrationSecure from './pages/public/VisitorRegistrationSelfService';
import AdminLogin from './pages/auth/AdminLoginReal';
import Dashboard from './pages/admin/DashboardReal';
import Employees from './pages/admin/EmployeesAutomatic';
import Attendance from './pages/admin/AttendanceSafety';
import Visitors from './pages/admin/VisitorsSelfService';
import SitesSecure from './pages/admin/SitesManagementGps';
import ActivityLogs from './pages/admin/ActivityLogsReal';
import Settings from './pages/admin/BackendUnavailable';
import AdminLayout from './components/layout/AdminLayout';
import { getVerificationSession } from './services/verificationSession';
import { verificationApi } from './services/api';

function Protected({ children }) { const { isAuthenticated } = useAuth(); return isAuthenticated ? children : <Navigate to="/admin/login" replace />; }
function VerificationRequired({ children }) { const { siteId } = useParams(); const [allowed, setAllowed] = useState(null); useEffect(() => { verificationApi.getSite(siteId).then(({ data }) => { const site = data.data || data.site || data; setAllowed(site.geofencingEnabled === false || !!getVerificationSession(siteId)); }).catch(() => setAllowed(false)); }, [siteId]); if (allowed === null) return null; return allowed ? children : <Navigate to={`/verify/${siteId}`} replace />; }
 function AppRoutes() { return <Routes><Route path="/" element={<Navigate to="/verify/SITE-CMB-01" replace />} /><Route path="/verify/:siteId" element={<VerificationGate />} /><Route path="/verify/:siteId/:action" element={<VerificationAction />} /><Route path="/verify/:siteId/:action/employee" element={<VerificationRequired><EmployeeActionWorkflow /></VerificationRequired>} /><Route path="/verify/:siteId/:action/visitor" element={<VerificationRequired><VisitorAction /></VerificationRequired>} /><Route path="/verify/:siteId/:action/success" element={<VerificationSuccess />} /><Route path="/verify/:siteId/employee" element={<LegacyEmployeeNotice />} /><Route path="/verify/:siteId/visitor" element={<VerificationRequired><VisitorRegistrationSecure /></VerificationRequired>} /><Route path="/verify/:siteId/success" element={<VerificationSuccess />} /><Route path="/verify/:siteId/status" element={<VisitorStatus />} /><Route path="/admin/login" element={<AdminLogin />} /><Route path="/admin" element={<Protected><AdminLayout /></Protected>}><Route index element={<Navigate to="dashboard" replace />} /><Route path="dashboard" element={<Dashboard />} /><Route path="sites" element={<SitesSecure />} /><Route path="employees" element={<Employees />} /><Route path="attendance" element={<Attendance />} /><Route path="visitors" element={<Visitors />} /><Route path="qr-codes" element={<QRCodesSecure />} /><Route path="activity-logs" element={<ActivityLogs />} /><Route path="settings" element={<Settings />} /></Route><Route path="*" element={<Navigate to="/verify/SITE-CMB-01" replace />} /></Routes>; }
export default function App() { return <AuthProvider><AppRoutes /></AuthProvider>; }
