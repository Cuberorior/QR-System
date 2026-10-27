
import express from "express";
import cors from "cors";
import helmet from "helmet";
import publicRoutes from "./routes/public.routes";
import locationRoutes from "./routes/location.routes";
import attendanceRoutes from "./routes/attendance-explicit.routes";
import adminAuthRoutes from "./routes/admin-auth.routes";
import adminEmployeeRoutes from "./routes/admin-employees-automatic.routes";
import adminAttendanceRoutes from "./routes/admin-attendance-safety.routes";
import { visitorPublicRoutes, adminVisitorRoutes } from "./routes/visitor-self-service.routes";
import adminSitesRoutes from "./routes/admin-sites.routes";
import adminEmailRoutes from "./routes/admin-email.routes";
import adminDashboardRoutes, { auditRouter } from "./routes/admin-dashboard.routes";
import safetyRoutes from "./routes/safety.routes";

const app = express();

app.use(helmet());
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173", process.env.FRONTEND_URL].filter((value): value is string => Boolean(value)),
}));

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "SITEPASS backend is running",
  });
});

app.use("/api/public", publicRoutes);
app.use("/api/public/location", locationRoutes);
app.use("/api/public/attendance", attendanceRoutes);
app.use("/api/public/attendance", safetyRoutes);
app.use("/api/public/visitors", visitorPublicRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/employees", adminEmployeeRoutes);
app.use("/api/admin/attendance", adminAttendanceRoutes);
app.use("/api/admin/visitors", adminVisitorRoutes);
app.use("/api/admin/sites", adminSitesRoutes);
app.use("/api/admin/email", adminEmailRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/audit-logs", auditRouter);

export default app;
