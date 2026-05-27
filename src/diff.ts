import { Change } from "./types";

function isObject(val: any): boolean {
  if (val === null || typeof val !== "object") return false;
  if (Array.isArray(val)) return false;
  if (val instanceof Date) return false;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(val)) return false;
  if (val.constructor?.name === "ObjectId" || val._bsontype === "ObjectId")
    return false;
  return true;
}

export function shouldTrack(
  path: string,
  ignore: string[],
  include?: string[],
): boolean {
  if (ignore.some((i) => path === i || path.startsWith(`${i}.`))) {
    return false;
  }
  if (include && include.length > 0) {
    return include.some(
      (i) => path === i || path.startsWith(`${i}.`) || i.startsWith(`${path}.`),
    );
  }
  return true;
}

export function diffObjects(
  oldObj: any,
  newObj: any,
  ignore: string[] = [],
  obfuscate: string[] = [],
  include?: string[],
  pathPrefix: string = "",
): Change[] {
  let changes: Change[] = [];

  const keys = new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj || {}),
  ]);

  for (const key of keys) {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (!shouldTrack(fullPath, ignore, include)) {
      continue;
    }

    const oldValue = oldObj?.[key];
    const newValue = newObj?.[key];

    if (isObject(oldValue) || isObject(newValue)) {
      // Recurse into nested objects
      const nestedOld = isObject(oldValue) ? oldValue : {};
      const nestedNew = isObject(newValue) ? newValue : {};

      const nestedChanges = diffObjects(
        nestedOld,
        nestedNew,
        ignore,
        obfuscate,
        include,
        fullPath,
      );
      changes = changes.concat(nestedChanges);
    } else {
      // Leaf node comparison (arrays, primitives, dates)
      const oldString = JSON.stringify(oldValue);
      const newString = JSON.stringify(newValue);

      if (oldString !== newString) {
        if (
          obfuscate.some((o) => fullPath === o || fullPath.startsWith(`${o}.`))
        ) {
          changes.push({
            field: fullPath,
            from: oldValue === undefined ? undefined : "***",
            to: newValue === undefined ? undefined : "***",
          });
        } else {
          changes.push({
            field: fullPath,
            from: oldValue,
            to: newValue,
          });
        }
      }
    }
  }

  return changes;
}
