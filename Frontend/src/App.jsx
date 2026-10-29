
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

import { AuthProvider, useAuth } from './context/AuthContext';

// Public verification pages
import VerificationGate from './pages/public/VerificationGateGps';
import VerificationSuccess from './pages/public/VerificationSuccessReal';
import VisitorStatus from './pages/public/VisitorAccess';
import EmployeeVerificationSecure from './pages/public/EmployeeSafetyVerification';
import VerificationAction from './pages/public/VerificationAction';
import EmployeeActionVerification from './pages/public/EmployeeActionVerification';
import EmployeeActionWorkflow from './pages/public/EmployeeActionWorkflow';
import VisitorAction from './pages/public/VisitorAction';
import LegacyEmployeeNotice from './pages/public/LegacyEmployeeNotice';
import VisitorRegistrationSecure from './pages/public/VisitorRegistrationSelfService';

// Admin pages
import AdminLogin from './pages/auth/AdminLoginReal';
import Dashboard from './pages/admin/DashboardReal';
import Employees from './pages/admin/EmployeesAutomatic';
import Attendance from './pages/admin/AttendanceSafety';
import Visitors from './pages/admin/VisitorsSelfService';
import SitesSecure from './pages/admin/SitesManagementGps';
import QRCodesSecure from './pages/admin/QRCodesTwoPerSite';
import ActivityLogs from './pages/admin/ActivityLogsRedesigned';
import Settings from './pages/admin/BackendUnavailable';
import DemoDashboard from './pages/admin/Dashboard';
import DemoSites from './pages/admin/Sites';
import DemoEmployees from './pages/admin/Employees';
import DemoAttendance from './pages/admin/Attendance';
import DemoVisitors from './pages/admin/Visitors';
import DemoQRCodes from './pages/admin/QRCodes';
import DemoActivityLogs from './pages/admin/ActivityLogs';
import DemoSettings from './pages/admin/Settings';
import { DEMO_MODE } from './services/demoMode';

// Layout
import AdminLayout from './components/layout/AdminLayout';

// Services
import { getVerificationSession } from './services/verificationSession';
import { verificationApi } from './services/api';

// Protect admin pages
function Protected({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

// Verify site and GPS session before accessing protected public flows
function VerificationRequired({ children }) {
  const { siteId } = useParams();

  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    let active = true;

    setAllowed(null);

    verificationApi
      .getSite(siteId)
      .then(({ data }) => {
        if (!active) return;

        const site = data.data || data.site || data;

        const gpsDisabled = site.geofencingEnabled === false;
        const hasVerificationSession = !!getVerificationSession(siteId);

        setAllowed(gpsDisabled || hasVerificationSession);
      })
      .catch(() => {
        if (active) {
          setAllowed(false);
        }
      });

    return () => {
      active = false;
    };
  }, [siteId]);

  if (allowed === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        Verifying site access...
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to={`/verify/${siteId}`} replace />;
  }

  return children;
}

// Application routes
function AppRoutes() {
  return (
    <Routes>
      {/* Homepage */}
      <Route
        path="/"
        element={<Navigate to="/admin/login" replace />}
      />

      {/* Legacy site verification */}
      <Route
        path="/verify/:siteId"
        element={<VerificationGate />}
      />

      {/* Entry QR and Exit QR */}
      <Route
        path="/verify/:siteId/:action"
        element={<VerificationAction />}
      />

      {/* Employee entry / exit workflow */}
      <Route
        path="/verify/:siteId/:action/employee"
        element={
          <VerificationRequired>
            <EmployeeActionWorkflow />
          </VerificationRequired>
        }
      />

      {/* Visitor entry / exit workflow */}
      <Route
        path="/verify/:siteId/:action/visitor"
        element={
          <VerificationRequired>
            <VisitorAction />
          </VerificationRequired>
        }
      />

      {/* Verification success */}
      <Route
        path="/verify/:siteId/:action/success"
        element={<VerificationSuccess />}
      />

      {/* Legacy employee route */}
      <Route
        path="/verify/:siteId/employee"
        element={<LegacyEmployeeNotice />}
      />

      {/* Visitor registration */}
      <Route
        path="/verify/:siteId/visitor"
        element={
          <VerificationRequired>
            <VisitorRegistrationSecure />
          </VerificationRequired>
        }
      />

      {/* Legacy success and visitor status */}
      <Route
        path="/verify/:siteId/success"
        element={<VerificationSuccess />}
      />

      <Route
        path="/verify/:siteId/status"
        element={<VisitorStatus />}
      />

      {/* Admin login */}
      <Route
        path="/admin/login"
        element={<AdminLogin />}
      />

      {/* Protected admin dashboard */}
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminLayout />
          </Protected>
        }
      >
        <Route
          index
          element={<Navigate to="dashboard" replace />}
        />

        <Route
          path="dashboard"
          element={DEMO_MODE ? <DemoDashboard /> : <Dashboard />}
        />

        <Route
          path="sites"
          element={DEMO_MODE ? <DemoSites /> : <SitesSecure />}
        />

        <Route
          path="employees"
          element={DEMO_MODE ? <DemoEmployees /> : <Employees />}
        />

        <Route
          path="attendance"
          element={DEMO_MODE ? <DemoAttendance /> : <Attendance />}
        />

        <Route
          path="visitors"
          element={DEMO_MODE ? <DemoVisitors /> : <Visitors />}
        />

        <Route
          path="qr-codes"
          element={DEMO_MODE ? <DemoQRCodes /> : <QRCodesSecure />}
        />

        <Route
          path="activity-logs"
          element={DEMO_MODE ? <DemoActivityLogs /> : <ActivityLogs />}
        />

        <Route
          path="settings"
          element={DEMO_MODE ? <DemoSettings /> : <Settings />}
        />
      </Route>

      {/* Unknown routes */}
      <Route
        path="*"
        element={<Navigate to="/admin/login" replace />}
      />
    </Routes>
  );
}

// Main application
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
