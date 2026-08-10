# Mongoose Auditor

A powerful, production-ready Mongoose plugin to automatically track document changes (creates, updates, deletes) with an advanced feature set including field obfuscation, automatic history reversion, TTL logs, and powerful query helpers.

## Features

- **Automatic Deep Diffing**: Only logs the exact nested fields that changed (e.g. `settings.notifications.sms: from false to true`).
- **Comprehensive Hook Support**: Intercepts `save`, `findOneAndUpdate`, `updateOne`, `updateMany`, and `findOneAndDelete`.
- **Global Actor Context**: Track _who_ made the changes globally across the app.
- **Data Obfuscation**: Mask sensitive data (like passwords) in the logs.
- **TTL Log Cleanup**: Automatically delete old audit logs.
- **Custom Database Connection**: Store logs in a completely separate database for compliance.
- **CSV/JSON Export**: Built-in functions to export flattened CSV reports for SOC2/HIPAA compliance.
- **State Reversion**: Easily rollback a document to its previous state with a single method call.
- **Pagination & Query Helpers**: Fetch formatted history easily with built-in paginated statics.
- **Zero-Latency Writes**: Asynchronous non-blocking architecture ensures main app speed isn't impacted.
- **Opt-in & Opt-out Tracking**: Granular control via `ignore` and `include` arrays.
- **Custom Metadata**: Inject IP Addresses, User Agents, or reasons directly into logs.
- **Event Emitters**: Globally listen for `auditLogCreated` to fire off webhooks or analytics.

---

## 📦 Installation

Install the package via **npm** or **yarn**:

```bash
$ npm install mongoose-auditor
```

```bash
$ yarn add mongoose-auditor
```

---

## Quick Setup

```typescript
import mongoose from "mongoose";
import { auditTrail, AuditLog } from "mongoose-auditor";

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: { type: String, select: false },
});

// Plug it in!
UserSchema.plugin(auditTrail, {
  obfuscate: ["password"], // Masks passwords in audit logs with "***"
  ignore: ["updatedAt"], // Never log this field
  retainDays: 90, // Auto-delete logs after 90 days
  getActor: () => globalCurrentUser?._id, // Globally resolve the actor making changes
});

const UserModel = mongoose.model("User", UserSchema);
```

---

## Plugin Options

When initializing the plugin, you can pass an `AuditTrailOptions` object:

| Option        | Type                  | Description                                                                            |
| :------------ | :-------------------- | :------------------------------------------------------------------------------------- |
| `ignore`      | `string[]`            | Fields to completely ignore during diffing (e.g. `['updatedAt']`).                     |
| `include`     | `string[]`            | Opt-in mode. Only fields starting with these paths will be audited.                    |
| `obfuscate`   | `string[]`            | Fields to mask with `"***"` in the audit log (e.g. `['password']`).                    |
| `retainDays`  | `number`              | Sets up a MongoDB TTL index to auto-delete logs after `X` days.                        |
| `background`  | `boolean`             | Default `true`. Saves audit logs asynchronously so they don't block main app requests. |
| `connection`  | `mongoose.Connection` | Compiles the `AuditLog` model on a custom database connection.                         |
| `getActor`    | `() => ObjectId`      | A callback function to dynamically resolve the actor ID (e.g. via AsyncLocalStorage).  |
| `getMetadata` | `() => Record`        | Dynamically inject metadata into every log (e.g., IP Address, User Agent).             |

---

## Global Actor Context (AsyncLocalStorage)

Passing the actor/user ID manually to every `save()` or `findOneAndUpdate()` is tedious. By using the `getActor` option alongside Node's built-in `AsyncLocalStorage`, your audit trails can automatically figure out _who_ triggered a database change without any extra code!

**1. Create a Context Store:**

```typescript
import { AsyncLocalStorage } from "async_hooks";
export const requestContext = new AsyncLocalStorage<{ userId: string }>();
```

**2. Set Context via Express Middleware:**

```typescript
app.use((req, res, next) => {
  const userId = req.user?._id; // Assuming auth middleware ran first

  // Wrap the request in the context
  requestContext.run({ userId }, () => {
    next();
  });
});
```

**3. Configure the Plugin:**

```typescript
UserSchema.plugin(auditTrail, {
  getActor: () => requestContext.getStore()?.userId,
});
```

Now, calling `await user.save()` anywhere in your app will magically log the correct `userId` in the audit log!

### Triggering Middleware Manually

If you aren't using the `getActor` global context, you can optionally pass the actor ID directly through query options when using Mongoose operations:

```typescript
await UserModel.findOneAndUpdate(
  { _id: req.params.id },
  { $set: req.body },
  { actor: currentUserId }, // Passed dynamically via query options
);
```

---

## Reverting History

You can instantly rollback a document to an older state using the `.revert()` method on an `AuditLog` instance.

```typescript
const log = await AuditLog.findById(req.params.logId);

// Reverts the specific changes logged in this entry.
// Optionally pass an array of fields to NOT revert.
const restoredDocument = await log.revert(["updatedAt", "lastLogin"]);
```

> **Note:** Reverting a "delete" operation will completely recreate the original document using the data captured when it was initially created! Reverting history does _not_ trigger the plugin to create redundant, recursive audit logs.

---

## Common Query Functions (Table View)

The `AuditLog` model provides three static helper functions heavily optimized with MongoDB indexes to fetch historical data efficiently.

| Function Name       | Description                                                                | Arguments to Pass                                                                                         | Return Type                                   |
| :------------------ | :------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **`getByDocument`** | Fetch the entire lifecycle history for a single, specific document.        | `documentId: string \| ObjectId`<br>`options: { populateActor?: boolean; skip?: number; limit?: number }` | `Query<AuditLogDocument[], AuditLogDocument>` |
| **`getByActor`**    | Fetch all actions made globally by a specific actor/user.                  | `actorId: string \| ObjectId`<br>`options: { populateActor?: boolean; skip?: number; limit?: number }`    | `Query<AuditLogDocument[], AuditLogDocument>` |
| **`getByModel`**    | Fetch all changes that occurred to an entire Mongoose Model (e.g. "User"). | `modelName: string`<br>`options: { populateActor?: boolean; skip?: number; limit?: number }`              | `Query<AuditLogDocument[], AuditLogDocument>` |
| **`deleteByActor`** | Delete all actions made globally by a specific actor/user.                 | `actorId: string \| ObjectId`                                                                             | `Query<any, AuditLogDocument>`                |

### Query Example (with Pagination and Deletion)

```typescript
import { AuditLog } from "mongoose-auditor";

// Get Page 2 of user 123's actions
const logs = await AuditLog.getByActor("123", {
  populateActor: true,
  limit: 10,
  skip: 10,
});

// Delete all logs for user 123
await AuditLog.deleteByActor("123");
```

---

## Event Emitters (Webhooks)

You can globally listen to audit events across your entire application. This is extremely useful for streaming logs to Datadog, Slack, or triggering internal webhooks.

```typescript
import { auditEvents } from "mongoose-auditor";

auditEvents.on("auditLogCreated", (log) => {
  console.log(`[ALERT] Action performed by ${log.actor}`);
  console.log(`Metadata IP:`, log.metadata?.ipAddress);
  // Example: SlackWebhook.send(log)
});
```

---

## High-Scale Performance Best Practices

To ensure `mongoose-auditor` does not bottleneck your enterprise application, keep these three things in mind:

### 1️⃣ Asynchronous Writes (Enabled by Default)

The plugin has the `background: true` option enabled by default. This fires off the `AuditLog.create()` database commands asynchronously without blocking the main event loop. Your primary `await user.save()` finishes instantly without waiting for the audit log to save.

_(Note: Set `background: false` if you require strict ACID-like guarantees that an audit log absolutely saved before responding to the user)._

```typescript
UserSchema.plugin(auditTrail, {
  background: false, // Forces the app to wait for the audit log to save before continuing
});
```

### 2️⃣ Blazing Fast Reads with `.lean()`

When rendering history tables for users on the frontend, reading thousands of raw Mongoose documents wastes severe CPU and RAM. **Always append `.lean()` to the built-in query helpers for maximum speed.**

```typescript
const logs = await AuditLog.getByDocument(documentId, { limit: 100 }).lean(); // Extremely fast!
```

### 3️⃣ Dangerous `updateMany` Operations

If you run `UserModel.updateMany({}, { active: true })` on 1,000,000 users, the audit trail MUST pull all 1,000,000 users into RAM to calculate the exact diffs. **This will crash your server.**
For massive bulk updates, always bypass the audit trail:

```typescript
await UserModel.updateMany({}, { active: true }, { __skipAudit: true });
```

---

## Data Exporting & Compliance (CSV / JSON)

For enterprise applications that require regular SOC2 or HIPAA compliance audits, you can easily export historical data.

The `exportToCSV` utility automatically **flattens** your audit trail. This means if a single `update` operation modified 5 different fields, the CSV will output 5 distinct rows (one per field change) for incredibly easy filtering in Excel.

```typescript
import { exportToCSV, exportToJSON } from "mongoose-auditor";

app.get("/users/:id/export-csv", async (req, res) => {
  // 1. Fetch lightweight objects using .lean()
  const logs = await AuditLog.getByDocument(req.params.id).lean();

  // 2. Generate a flat CSV string (cast to 'any' when using lean)
  const csvString = exportToCSV(logs as any);

  // 3. Trigger download in browser
  res.header("Content-Type", "text/csv");
  res.attachment(`audit-logs.csv`);
  res.send(csvString);
});
```

---

## Reverting "Delete" Operations

`mongoose-auditor` fully supports reverting deleted documents. Even if you use `findOneAndDelete()`, the "delete" audit log can be reversed to recreate the original document!

When a document is deleted, the plugin logs the deletion. To revert it, the plugin will look up the original `"create"` audit log for that document, and re-insert the document with the data it originally had.

### Example

```typescript
// 1. A document is deleted
await UserModel.findOneAndDelete({ _id: userId });

// 2. Find the delete log
const deleteLog = await AuditLog.findOne({
  documentId: userId,
  operation: "delete"
});

// 3. Revert the delete!
await deleteLog.revert(); // The user is recreated using their original data!
```

> **Note:** Reverting a delete operation requires the original `"create"` audit log to exist in the database. If your `retainDays` TTL has already deleted the create log, the reversion will fail.

