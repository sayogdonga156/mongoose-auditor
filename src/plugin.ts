import { HydratedDocument, Model, Schema, Query } from "mongoose";

import { getAuditLogModel } from "./audit.model";
import { diffObjects, shouldTrack } from "./diff";
import { auditEvents } from "./index";
import { AuditLocals, AuditTrailOptions } from "./types";
import { cleanObject } from "./utils/cleanObject";

export function auditTrail<T extends Record<string, any>>(
  schema: Schema<T>,
  options: AuditTrailOptions = {},
) {
  const { ignore = [], obfuscate = [], include, getActor, getMetadata, connection, retainDays, background = true } = options;

  // Set up TTL if needed
  if (retainDays) {
    const AuditLog = getAuditLogModel(connection);
    // expireAfterSeconds automatically removes documents after the specified seconds
    AuditLog.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: retainDays * 86400 }).catch(console.error);
  }

  /*
   * PRE SAVE
   */
  schema.pre(
    "save",
    async function (
      this: HydratedDocument<T> & {
        $locals: AuditLocals & { __skipAudit?: boolean };
      },
    ) {
      try {
        if (this.$locals.__skipAudit) {
          return;
        }

        if (this.isNew) {
          return;
        }

        if (!this.isModified()) {
          return;
        }

        const modifiedPaths = this.modifiedPaths();
        const hasRelevantChanges = modifiedPaths.some(
          (path) => shouldTrack(path, ignore, include),
        );
        if (!hasRelevantChanges) {
          return;
        }

        const model = this.constructor as Model<T>;
        const original = await model.findById(this._id).lean();

        if (!original) {
          return;
        }

        this.$locals.original = cleanObject(
          original as Record<string, unknown>,
        );
      } catch (error) {
        console.error("audit pre-save error", error);
      }
    },
  );

  /*
   * POST SAVE
   */
  schema.post(
    "save",
    async function (
      this: HydratedDocument<T> & {
        $locals: AuditLocals & { __skipAudit?: boolean };
      },
    ) {
      try {
        if (this.$locals.__skipAudit) {
          return;
        }

        const original = this.$locals.original;
        const current = cleanObject(this.toObject() as Record<string, unknown>);
        const operation = original ? "update" : "create";

        const changes = diffObjects(original || {}, current, ignore, obfuscate, include);

        if (!changes.length && operation === "update") {
          return;
        }

        const model = this.constructor as Model<T>;
        const AuditLog = getAuditLogModel(connection);

        const actor = getActor ? getActor() : (this.$locals.actor || null);

        const metadata = getMetadata ? getMetadata() : {};

        const logPromise = AuditLog.create({
          modelName: model.modelName,
          collectionName: model.collection.name,
          documentId: this._id,
          actor,
          metadata,
          operation,
          changes,
        }).then(log => {
          auditEvents.emit("auditLogCreated", log);
        }).catch(err => console.error("audit post-save log creation error", err));

        if (!background) {
          await logPromise;
        }
      } catch (error) {
        console.error("audit post-save error", error);
      }
    },
  );

  /*
   * QUERY MIDDLEWARE
   */
  schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], async function (this: Query<any, any>) {
    try {
      if ((this.getOptions() as any).__skipAudit) return;

      const model = this.model;
      const originals = await model.find(this.getQuery()).lean();
      (this as any)._auditOriginals = originals.map((doc: any) => cleanObject(doc));
    } catch (error) {
      console.error("audit pre-query error", error);
    }
  });

  schema.post(["findOneAndUpdate", "updateOne", "updateMany"], async function (this: Query<any, any>) {
    try {
      if ((this.getOptions() as any).__skipAudit) return;

      const originals = (this as any)._auditOriginals || [];
      if (!originals.length) return;

      const model = this.model;
      const AuditLog = getAuditLogModel(connection);
      
      const actor = getActor ? getActor() : ((this.getOptions() as any).actor || null);

      // Fetch the updated documents
      const ids = originals.map((doc: any) => doc._id);
      const updatedDocs = await model.find({ _id: { $in: ids } }).lean();

      for (const original of originals) {
        const currentDoc = updatedDocs.find((d: any) => String(d._id) === String(original._id));
        if (!currentDoc) continue;

        const current = cleanObject(currentDoc as Record<string, unknown>);
        const changes = diffObjects(original, current, ignore, obfuscate, include);

        if (changes.length) {
          const metadata = getMetadata ? getMetadata() : {};

          const logPromise = AuditLog.create({
            modelName: model.modelName,
            collectionName: model.collection.name,
            documentId: original._id,
            actor,
            metadata,
            operation: "update",
            changes,
          }).then(log => {
            auditEvents.emit("auditLogCreated", log);
          }).catch(err => console.error("audit post-query log creation error", err));

          if (!background) {
            await logPromise;
          }
        }
      }
    } catch (error) {
      console.error("audit post-query error", error);
    }
  });

  /*
   * DELETE SUPPORT
   */
  schema.post("findOneAndDelete", async function (this: Query<any, any>, doc) {
    try {
      if ((this.getOptions() as any).__skipAudit) return;

      if (!doc) {
        return;
      }

      const model = doc.constructor as Model<T>;
      const AuditLog = getAuditLogModel(connection);
      
      const actor = getActor ? getActor() : ((this.getOptions() as any).actor || null);

      const metadata = getMetadata ? getMetadata() : {};

      const logPromise = AuditLog.create({
        modelName: model.modelName,
        collectionName: model.collection.name,
        documentId: doc._id,
        actor,
        metadata,
        operation: "delete",
        changes: [],
      }).then(log => {
        auditEvents.emit("auditLogCreated", log);
      }).catch(err => console.error("audit delete log creation error", err));

      if (!background) {
        await logPromise;
      }
    } catch (error) {
      console.error("audit delete error", error);
    }
  });
}
