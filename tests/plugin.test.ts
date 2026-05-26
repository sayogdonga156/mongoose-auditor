import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { auditTrail, AuditLog } from "../src";

let mongoServer: MongoMemoryServer;

const TestSchema = new mongoose.Schema({
  name: String,
  age: Number,
  password: { type: String, select: false },
});

TestSchema.plugin(auditTrail, {
  background: false, // Important for tests to block and ensure log is saved!
  obfuscate: ["password"],
  getActor: () => new mongoose.Types.ObjectId("5f9d88b9c3b9c8b9c8b9c8b9"),
});

const TestModel = mongoose.model("TestDoc", TestSchema);

describe("Mongoose Audit Trail Plugin", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await TestModel.deleteMany({});
    await AuditLog.deleteMany({});
  });

  it("should create an audit log on document save (create)", async () => {
    const doc = await TestModel.create({
      name: "John",
      age: 30,
      password: "123",
    });

    const logs = await AuditLog.getByDocument(doc._id);
    expect(logs.length).toBe(1);
    expect(logs[0].operation).toBe("create");
    expect(logs[0].modelName).toBe("TestDoc");
    expect(String(logs[0].actor)).toBe("5f9d88b9c3b9c8b9c8b9c8b9");

    // Test obfuscation
    const passChange = logs[0].changes.find((c) => c.field === "password");
    expect(passChange?.to).toBe("***");
  });

  it("should create an audit log on document save (update)", async () => {
    const doc = await TestModel.create({ name: "John", age: 30 });

    doc.name = "Jack";
    await doc.save();

    const logs = await AuditLog.getByDocument(doc._id, { skip: 0 });
    expect(logs.length).toBe(2); // create + update

    const updateLog = logs[0]; // Sort is -1 (newest first)
    expect(updateLog.operation).toBe("update");

    const nameChange = updateLog.changes.find((c) => c.field === "name");
    expect(nameChange?.from).toBe("John");
    expect(nameChange?.to).toBe("Jack");
  });

  it("should create an audit log on findOneAndUpdate", async () => {
    const doc = await TestModel.create({ name: "John", age: 30 });

    await TestModel.findOneAndUpdate({ _id: doc._id }, { $set: { age: 35 } });

    const logs = await AuditLog.getByDocument(doc._id);
    expect(logs.length).toBe(2);

    const updateLog = logs[0];
    expect(updateLog.operation).toBe("update");

    const ageChange = updateLog.changes.find((c) => c.field === "age");
    expect(ageChange?.from).toBe(30);
    expect(ageChange?.to).toBe(35);
  });

  it("should create an audit log on findOneAndDelete", async () => {
    const doc = await TestModel.create({ name: "John", age: 30 });

    await TestModel.findOneAndDelete({ _id: doc._id });

    const logs = await AuditLog.getByDocument(doc._id);
    expect(logs.length).toBe(2);

    const deleteLog = logs[0];
    expect(deleteLog.operation).toBe("delete");
    expect(deleteLog.changes.length).toBe(0);
  });

  it("should not create audit log if __skipAudit is true", async () => {
    const doc = await TestModel.create({ name: "John", age: 30 });

    await TestModel.findOneAndUpdate({ _id: doc._id }, { $set: { age: 35 } }, {
      __skipAudit: true,
    } as any);

    const logs = await AuditLog.getByDocument(doc._id);
    // Should only have the "create" log
    expect(logs.length).toBe(1);
    expect(logs[0].operation).toBe("create");
  });
});
