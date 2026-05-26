import mongoose, { InferSchemaType } from "mongoose";
import { AuditLogDocument, AuditLogModel } from "./types";

const AuditSchema = new mongoose.Schema(
  {
    modelName: {
      type: String,
      required: true,
    },

    collectionName: {
      type: String,
      required: true,
    },

    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    operation: {
      type: String,

      enum: ["create", "update", "delete"],

      required: true,
    },

    changes: {
      type: Array,

      default: [],
    },

    createdAt: {
      type: Date,

      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

// Performance Indexes for fast querying
AuditSchema.index({ documentId: 1, createdAt: -1 });
AuditSchema.index({ modelName: 1, createdAt: -1 });
AuditSchema.index({ actor: 1, createdAt: -1 });

AuditSchema.statics.getByDocument = function(documentId: mongoose.Types.ObjectId, options?: { populateActor?: boolean, skip?: number, limit?: number }) {
  let query = this.find({ documentId }).sort({ createdAt: -1 });
  if (options?.populateActor) {
    query = query.populate("actor");
  }
  if (options?.skip) {
    query = query.skip(options.skip);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  return query;
};

AuditSchema.statics.getByModel = function(modelName: string, options?: { populateActor?: boolean, skip?: number, limit?: number }) {
  let query = this.find({ modelName: modelName }).sort({ createdAt: -1 });
  if (options?.populateActor) {
    query = query.populate("actor");
  }
  if (options?.skip) {
    query = query.skip(options.skip);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  return query;
};

AuditSchema.statics.getByActor = function(actorId: mongoose.Types.ObjectId, options?: { populateActor?: boolean, skip?: number, limit?: number }) {
  let query = this.find({ actor: actorId }).sort({ createdAt: -1 });
  if (options?.populateActor) {
    query = query.populate("actor");
  }
  if (options?.skip) {
    query = query.skip(options.skip);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  return query;
};

AuditSchema.methods.revert = async function(ignore: string[] = []) {
  const modelNameString = this.modelName;
  const targetModel = (this.constructor as mongoose.Model<any>).db.model(modelNameString);

  if (!targetModel) {
    throw new Error(`Model ${modelNameString} not found on this connection`);
  }

  if (this.operation === "create") {
    throw new Error("Cannot revert a create operation because it would delete the document completely.");
  }

  if (this.operation === "delete") {
    const AuditLogModel = this.constructor as mongoose.Model<any>;
    const createLog = await AuditLogModel.findOne({ 
      documentId: this.documentId, 
      operation: "create" 
    });

    if (!createLog) {
      throw new Error("Cannot revert a delete operation because the original create audit log was not found.");
    }

    const restorePayload: Record<string, any> = {};
    for (const change of createLog.changes) {
      if (ignore.includes(change.field)) continue;
      if (change.to !== "***" && change.to !== undefined) {
        restorePayload[change.field] = change.to;
      }
    }

    const doc = new targetModel(restorePayload);
    doc.$locals.__skipAudit = true;
    return await doc.save();
  }

  const updatePayload: Record<string, any> = {};
  for (const change of this.changes) {
    if (ignore.includes(change.field)) {
      continue;
    }
    if (change.from === "***" || change.to === "***") {
      throw new Error(`Cannot revert obfuscated field: ${change.field}`);
    }
    updatePayload[change.field] = change.from;
  }

  return await targetModel.findByIdAndUpdate(
    this.documentId,
    { $set: updatePayload },
    { new: true, __skipAudit: true } as any
  );
};

export type AuditDocument = AuditLogDocument;

export function getAuditLogModel(connection?: mongoose.Connection): AuditLogModel {
  if (connection) {
    return (connection.models.AuditLog || connection.model<AuditLogDocument, AuditLogModel>("AuditLog", AuditSchema)) as AuditLogModel;
  }
  return (mongoose.models.AuditLog || mongoose.model<AuditLogDocument, AuditLogModel>("AuditLog", AuditSchema)) as AuditLogModel;
}

export const AuditLog: AuditLogModel = getAuditLogModel();
