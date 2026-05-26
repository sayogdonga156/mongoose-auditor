import { AuditLogDocument } from "./types";

export function exportToJSON(logs: AuditLogDocument[]): string {
  return JSON.stringify(logs, null, 2);
}

export function exportToCSV(logs: AuditLogDocument[]): string {
  const headers = [
    "Log ID",
    "Timestamp",
    "Model",
    "Document ID",
    "Operation",
    "Actor",
    "Field",
    "From",
    "To",
    "Metadata"
  ];

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows: string[] = [headers.join(",")];

  for (const log of logs) {
    const baseRow = [
      escapeCSV(log._id),
      escapeCSV(log.createdAt?.toISOString()),
      escapeCSV(log.modelName),
      escapeCSV(log.documentId),
      escapeCSV(log.operation),
      escapeCSV(log.actor),
    ];

    const metadataStr = escapeCSV(log.metadata);

    if (!log.changes || log.changes.length === 0) {
      // Operations like "delete" might have empty changes array
      rows.push([...baseRow, "", "", "", metadataStr].join(","));
      continue;
    }

    for (const change of log.changes) {
      const row = [
        ...baseRow,
        escapeCSV(change.field),
        escapeCSV(change.from),
        escapeCSV(change.to),
        metadataStr
      ];
      rows.push(row.join(","));
    }
  }

  return rows.join("\n");
}
