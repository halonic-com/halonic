const kilobyte = 1024;
const megabyte = 1024 * 1024;

/** A file's size as people read it: "3 KB", "2.4 MB"; never "0 KB" for a small file. */
export function sizeOf(bytes: number): string {
  if (bytes < megabyte) return `${Math.max(1, Math.round(bytes / kilobyte))} KB`;
  return `${(bytes / megabyte).toFixed(1)} MB`;
}
