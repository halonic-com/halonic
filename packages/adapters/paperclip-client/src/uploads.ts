import type { UploadRule } from "./requests.ts";

/** One file to upload: its name, its type and its bytes. */
export interface Upload {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

/** The eight bytes every PNG file starts with. */
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A file name Paperclip stores as it is: plain characters, ending `.png`, at most 100 long. */
const safePngName = /^[A-Za-z0-9._-]{1,96}\.png$/;

/** Whether `bytes` start like a PNG file. */
export function looksLikePng(bytes: Uint8Array): boolean {
  return bytes.length > pngSignature.length && pngSignature.every((byte, at) => bytes[at] === byte);
}

/**
 * Whether `upload` may go with a row whose rule is `rule`: the rule's type, a plain file name,
 * not empty, no larger than the rule allows, and bytes that really are a PNG, so the row can't
 * carry any other file whatever its name or type says.
 */
export function fitsUpload(rule: UploadRule, upload: Upload): boolean {
  return (
    upload.contentType === rule.contentType &&
    safePngName.test(upload.fileName) &&
    upload.bytes.length <= rule.maxBytes &&
    looksLikePng(upload.bytes)
  );
}

/** A multipart body and the content type that names its boundary. */
export interface MultipartBody {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/**
 * The multipart form for `upload`: one part, in the rule's field, and nothing else. Written by
 * hand because the host's Web types leave `FormData` and `Blob` out; the file name is already
 * plain (see {@link fitsUpload}), so it needs no quoting.
 */
export function uploadForm(rule: UploadRule, upload: Upload): MultipartBody {
  const boundary = `halonic-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${rule.field}"; filename="${upload.fileName}"\r\n` +
      `Content-Type: ${upload.contentType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const bytes = new Uint8Array(head.length + upload.bytes.length + tail.length);
  bytes.set(head, 0);
  bytes.set(upload.bytes, head.length);
  bytes.set(tail, head.length + upload.bytes.length);
  return { bytes, contentType: `multipart/form-data; boundary=${boundary}` };
}
