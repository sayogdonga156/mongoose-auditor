import "mongoose";

import { AuditLocals } from "./types";

declare module "mongoose" {
  interface Document {
    $locals: AuditLocals & Document["$locals"];
  }
}
