import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { auditTrail, AuditLog, auditEvents, exportToCSV } from "../src/index";

// Showcase: Event Emitter Listening
auditEvents.on("auditLogCreated", (log) => {
  console.log(
    `\n🔔 [EVENT] New Audit Log Created for ${log.modelName} (Operation: ${log.operation})`,
  );
});

const app = express();
app.use(cors());
app.use(express.json());

interface User {
  name: string;
  age: number;
  password?: string;
  settings?: {
    notifications: {
      email: boolean;
      sms: boolean;
    };
  };
  deletedAt?: Date;
}

const UserSchema = new mongoose.Schema<User>({
  name: String,
  age: Number,
  password: { type: String, select: false },
  settings: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
  },
  deletedAt: { type: Date, default: null, index: true }, // Crucial index for fast active queries!
});

UserSchema.plugin(auditTrail, {
  obfuscate: ["password"],
  ignore: ["updatedAt"],
  getMetadata: () => ({
    ipAddress: "127.0.0.1",
    userAgent: "PostmanRuntime/7.29.0",
  }),
  retainDays: 30, // Test TTL (expires in 30 days)
});

const UserModel = mongoose.model<User>("User", UserSchema);

// CREATE User
app.post("/users", async (req, res) => {
  try {
    const { name, age, password } = req.body;
    const user = await UserModel.create({ name, age, password });

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// READ User (Only fetch if not softly deleted)
app.get("/users/:id", async (req, res) => {
  try {
    const user = await UserModel.findOne({
      _id: req.params.id,
      deletedAt: null,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// UPDATE User
app.put("/users/:id", async (req, res) => {
  try {
    const actorId = new mongoose.Types.ObjectId(); // Simulate actor

    const user = await UserModel.findOneAndUpdate(
      { _id: req.params.id },
      { $set: req.body },
      { new: true, actor: actorId } as any, // passing actor via query options
    );

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// DELETE User (Soft Delete Pattern)
app.delete("/users/:id", async (req, res) => {
  try {
    // Instead of hard deleting, we update deletedAt. The Audit Trail automatically tracks this!
    const user = await UserModel.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { deletedAt: new Date() } },
      { new: true },
    );

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET Audit Logs for a Specific Document (User)
app.get("/users/:id/audit-logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;
    const logs = await AuditLog.getByDocument(req.params.id, { limit, skip });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// EXPORT Audit Logs as CSV
app.get("/users/:id/export-csv", async (req, res) => {
  try {
    const logs = await AuditLog.getByDocument(req.params.id, {
      limit: 1000,
    }).lean();
    const csvString = exportToCSV(logs as any);

    res.header("Content-Type", "text/csv");
    res.attachment(`audit-logs-${req.params.id}.csv`);
    res.send(csvString);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET Audit Logs for a Specific Actor (User who made changes)
app.get("/audit-logs/by-actor/:actorId", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;
    const logs = await AuditLog.getByActor(req.params.actorId, { limit, skip });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET Audit Logs for a Specific Model
app.get("/audit-logs/by-model/:modelName", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;
    const logs = await AuditLog.getByModel(req.params.modelName, {
      limit,
      skip,
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// EXPORT Audit Logs for Actor as CSV
app.get("/audit-logs/by-actor/:actorId/export-csv", async (req, res) => {
  try {
    const logs = await AuditLog.getByActor(req.params.actorId, {
      limit: 1000,
    }).lean();
    const csvString = exportToCSV(logs as any);

    res.header("Content-Type", "text/csv");
    res.attachment(`audit-logs-actor-${req.params.actorId}.csv`);
    res.send(csvString);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// EXPORT Audit Logs for Model as CSV
app.get("/audit-logs/by-model/:modelName/export-csv", async (req, res) => {
  try {
    const logs = await AuditLog.getByModel(req.params.modelName, {
      limit: 1000,
    }).lean();
    const csvString = exportToCSV(logs as any);

    res.header("Content-Type", "text/csv");
    res.attachment(`audit-logs-model-${req.params.modelName}.csv`);
    res.send(csvString);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// REVERT an Audit Log
app.post("/audit-logs/:logId/revert", async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.logId);
    if (!log) return res.status(404).json({ error: "Audit log not found" });

    // Call the new revert method, passing an optional array of fields to ignore during reversion
    // e.g., we don't want to accidentally revert 'updatedAt' if we were tracking it
    const updatedDoc = await log.revert(["updatedAt"]);
    res.json({ message: "Reverted successfully", updatedDoc });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Start Server
async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/test");
  console.log("Connected to MongoDB");

  const port = 3000;
  app.listen(port, () => {
    console.log(`API Server is running on http://localhost:${port}`);
    console.log(`\nEndpoints ready to test via Postman:`);
    console.log(
      `POST   http://localhost:3000/users (body: { "name": "Jack", "age": 20, "password": "123" })`,
    );
    console.log(`GET    http://localhost:3000/users/:id`);
    console.log(
      `PUT    http://localhost:3000/users/:id (body: { "name": "John" })`,
    );
    console.log(`DELETE http://localhost:3000/users/:id`);
    console.log(`GET    http://localhost:3000/users/:id/audit-logs`);
    console.log(`GET    http://localhost:3000/users/:id/export-csv`);
  });
}

main().catch(console.error);
