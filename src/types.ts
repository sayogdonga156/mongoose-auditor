import mongoose, { Types, Connection } from "mongoose";

export interface AuditTrailOptions {
  ignore?: string[];
  include?: string[];
  obfuscate?: string[];
  connection?: Connection;
  retainDays?: number;
  background?: boolean;
  getActor?: () => Types.ObjectId | null | undefined;
  getMetadata?: () => Record<string, any>;
}

export interface Change {
  field: string;
  from: unknown;
  to: unknown;
}

export interface AuditLogDocument extends mongoose.Document {
  modelName: string;
  collectionName: string;
  documentId: Types.ObjectId;
  actor?: Types.ObjectId | null;
  metadata?: Record<string, any>;
  operation: "create" | "update" | "delete";
  changes: Change[];
  createdAt: Date;

  revert(ignore?: string[]): Promise<any>;
}

export interface AuditLogModel extends mongoose.Model<AuditLogDocument> {
  getByDocument(
    documentId: string | Types.ObjectId,
    options?: { populateActor?: boolean; skip?: number; limit?: number },
  ): mongoose.Query<AuditLogDocument[], AuditLogDocument>;

  getByModel(
    modelName: string,
    options?: { populateActor?: boolean; skip?: number; limit?: number },
  ): mongoose.Query<AuditLogDocument[], AuditLogDocument>;

  getByActor(
    actorId: string | Types.ObjectId,
    options?: { populateActor?: boolean; skip?: number; limit?: number },
  ): mongoose.Query<AuditLogDocument[], AuditLogDocument>;
}

export interface AuditLocals {
  original?: Record<string, unknown>;

  actor?: Types.ObjectId | null;
}
