export function cleanObject<T>(obj: T): T {
  if (!obj) {
    return obj;
  }

  const cleaned = {
    ...(obj as object),
  };

  delete (cleaned as any).__v;

  return cleaned as T;
}
