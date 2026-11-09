
import express from "express";
import cors from "cors";
import helmet from "helmet";
import publicRoutes from "./routes/public.routes";
import locationRoutes from "./routes/location.routes";
import attendanceRoutes from "./routes/attendance-explicit.routes";
import adminAuthRoutes from "./routes/admin-auth.routes";
import adminEmployeeRoutes from "./routes/admin-employees-secure.routes";
import adminAttendanceRoutes from "./routes/admin-attendance-safety.routes";
import { visitorPublicRoutes, adminVisitorRoutes } from "./routes/visitor-self-service.routes";
import adminVisitorReportRoutes from "./routes/admin-visitor-report.routes";
import adminSitesRoutes from "./routes/admin-sites.routes";
import adminEmailRoutes from "./routes/admin-email.routes";
import adminDashboardRoutes, { auditRouter } from "./routes/admin-dashboard.routes";
import safetyRoutes from "./routes/safety.routes";
import { readHttpConfig } from "./config/runtime";

const app = express();
const httpConfig = readHttpConfig();
app.set("trust proxy", httpConfig.trustProxy);

app.use(helmet());
app.use(cors({
  origin: httpConfig.origins,
}));

app.use(express.json({ limit: "7mb" }));

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
app.use("/api/admin/visitors", adminVisitorReportRoutes);
app.use("/api/admin/visitors", adminVisitorRoutes);
app.use("/api/admin/sites", adminSitesRoutes);
app.use("/api/admin/email", adminEmailRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/audit-logs", auditRouter);

export default app;
