/**
 * A file's size as a file line says it: "1 byte", "512 bytes", "120 KB", "2.4 MB", "10 MB".
 * Just under 1 MB rounds to 1024 KB, which reads as 1 MB (Noah, HAL-17457).
 */
export function sizeText(bytes: number): string {
  if (bytes === 1) return "1 byte";
  if (bytes < 1024) return `${bytes} bytes`;
  const kilobytes = Math.round(bytes / 1024);
  if (kilobytes < 1024) return `${kilobytes} KB`;
  const megabytes = (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
  return `${megabytes} MB`;
}
