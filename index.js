import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import { ErrorCon } from './src/middleware/CatchAsync.js';
import { terminalColor } from './resources/Color_terminal.js';
import path from "path";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import http from "http";
import { initializeSocket, startReminderEngine } from './socketHelper.js';
import ADMINROUTE from "./src/routes/admin.route.js";
import companyRoutes from "./src/routes/company.routes.js";
import employeeRoutes from "./src/routes/employee.routes.js";
import teamRoutes from './src/routes/team.routes.js';
import jobRoutes from './src/routes/job.routes.js';
import staffRoutes from './src/routes/staff.routes.js';
import notificationRoutes from './src/routes/notification.routes.js';
import roleRoutes from './src/routes/role.routes.js';
import companyAdminMemberRoutes from './src/routes/company-admin-member.routes.js';
import "./src/models/team.model.js";
import "./src/models/staff.model.js";
import "./src/models/standardReply.model.js";
import "./src/models/job.model.js";
import "./src/models/employee.model.js";
import "./src/models/role.model.js";
import "./src/models/companyAdminMember.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: ['http://localhost:5173','http://localhost:5174', process.env.FRONTEND_URL, process.env.API_URL],
    credentials: true,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  })
);

app.use(terminalColor);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use('/uploads/pkg', express.static(path.join('uploads', 'pkg')));
app.use('/uploads/booking', express.static(path.join('uploads', 'booking')));
app.use('/uploads/chat', express.static(path.join('uploads', 'chat')));

app.use("/api/v1/admin", ADMINROUTE);
app.use("/api/v1/companies", companyRoutes);
app.use("/api/v1/employees", employeeRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/company-admin-members', companyAdminMemberRoutes);

app.use(ErrorCon);

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));

async function closeDB() {
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
  } catch (err) {
    console.error("Error closing MongoDB connection:", err);
  }
}

process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDB();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
const io = initializeSocket(server);
startReminderEngine();

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
