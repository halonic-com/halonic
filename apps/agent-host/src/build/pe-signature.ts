/**
 * Reads and clears the security directory of a Windows program (a PE file),
 * the entry that points at its Authenticode signature. Node's own `node.exe`
 * is signed, and injecting the agent host into it leaves that entry pointing
 * at bytes that are no longer the signature, so Windows sees a broken
 * signature rather than none. The build clears it before injecting, as Node's
 * single-executable guide says, and the release checks every program it packs.
 *
 * Plain byte reads, so it works on any OS (the PE layout:
 * https://learn.microsoft.com/windows/win32/debug/pe-format).
 */

/** Where a program's signature is: a file offset and a size, both in bytes. */
export interface SecurityDirectory {
  readonly offset: number;
  readonly size: number;
}

/** What a program's security directory holds. */
export type SignatureState =
  | { readonly kind: "none" }
  | { readonly kind: "certificate"; readonly directory: SecurityDirectory }
  | { readonly kind: "broken"; readonly directory: SecurityDirectory; readonly reason: string };

const peSignature = 0x00004550; // "PE\0\0"
const pe32Magic = 0x10b;
const pe32PlusMagic = 0x20b;
const securityDirectoryIndex = 4;
// WIN_CERTIFICATE: dwLength (4 bytes), wRevision (2), wCertificateType (2), then the data.
const certificateHeaderSize = 8;
const certificateRevision2 = 0x0200;
const certificateTypePkcsSignedData = 0x0002;

/** Whether the bytes are a Windows program or DLL: "MZ", then a PE header where it says. */
export function isPortableExecutable(bytes: Uint8Array): boolean {
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
  const view = viewOf(bytes);
  const peHeader = view.getUint32(0x3c, true);
  return peHeader + 4 <= bytes.length && view.getUint32(peHeader, true) === peSignature;
}

/**
 * The file offset of the security directory's entry in the optional header's
 * data directories. Throws when the bytes aren't a PE file or have no such entry.
 */
function securityEntryOffset(view: DataView): number {
  if (view.byteLength < 64 || view.getUint16(0, true) !== 0x5a4d) {
    throw new Error("not a Windows program: it doesn't start with MZ");
  }
  const peHeader = view.getUint32(0x3c, true);
  if (peHeader + 24 > view.byteLength || view.getUint32(peHeader, true) !== peSignature) {
    throw new Error("not a Windows program: no PE header");
  }
  const optionalHeader = peHeader + 24;
  const magic = view.getUint16(optionalHeader, true);
  if (magic !== pe32Magic && magic !== pe32PlusMagic) {
    throw new Error(`unknown optional header magic 0x${magic.toString(16)}`);
  }
  const directoryCountOffset = optionalHeader + (magic === pe32Magic ? 92 : 108);
  const directories = directoryCountOffset + 4;
  if (view.getUint32(directoryCountOffset, true) <= securityDirectoryIndex) {
    throw new Error("the optional header has no security directory");
  }
  const entry = directories + securityDirectoryIndex * 8;
  if (entry + 8 > view.byteLength)
    throw new Error("the security directory is past the end of the file");
  return entry;
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** A program's security directory, or `undefined` when it is empty (unsigned). */
export function readSecurityDirectory(bytes: Uint8Array): SecurityDirectory | undefined {
  const view = viewOf(bytes);
  const entry = securityEntryOffset(view);
  const offset = view.getUint32(entry, true);
  const size = view.getUint32(entry + 4, true);
  return offset === 0 && size === 0 ? undefined : { offset, size };
}

/**
 * Whether the security directory is empty, or holds what a signature looks
 * like: inside the file, 8-byte aligned, and a WIN_CERTIFICATE with PKCS #7
 * signed data that fits in it. It doesn't check the signature itself; on
 * Windows the release asks Authenticode for that.
 */
export function signatureState(bytes: Uint8Array): SignatureState {
  const directory = readSecurityDirectory(bytes);
  if (directory === undefined) return { kind: "none" };
  const broken = (reason: string): SignatureState => ({ kind: "broken", directory, reason });
  const { offset, size } = directory;
  if (offset % 8 !== 0) return broken(`it starts at ${offset}, which isn't 8-byte aligned`);
  if (size < certificateHeaderSize || offset + size > bytes.length) {
    return broken(`${size} bytes at ${offset} don't fit in the ${bytes.length}-byte file`);
  }
  const view = viewOf(bytes);
  const length = view.getUint32(offset, true);
  const revision = view.getUint16(offset + 4, true);
  const type = view.getUint16(offset + 6, true);
  if (length < certificateHeaderSize || length > size) {
    return broken(`its certificate says ${length} bytes, which doesn't fit in ${size}`);
  }
  if (revision !== certificateRevision2 || type !== certificateTypePkcsSignedData) {
    return broken(
      `it holds no Authenticode certificate (revision 0x${revision.toString(16)}, type 0x${type.toString(16)})`,
    );
  }
  return { kind: "certificate", directory };
}

/**
 * A copy of the program with its signature removed, as `signtool remove /s`
 * does: the security directory's entry is cleared, and the signature, which
 * Windows keeps at the end of the file, is cut off. Unsigned programs come
 * back unchanged. Throws when the signature isn't at the end, since anything
 * after it would then be cut too.
 */
export function withoutSignature(bytes: Uint8Array): Uint8Array {
  const view = viewOf(bytes);
  const entry = securityEntryOffset(view);
  const directory = readSecurityDirectory(bytes);
  if (directory === undefined) return bytes.slice();
  const end = directory.offset + directory.size;
  // The table is 8-byte aligned, so up to 7 bytes of padding may follow it.
  if (end > bytes.length || bytes.length - end >= 8) {
    throw new Error(
      `the signature (${directory.size} bytes at ${directory.offset}) isn't at the end of the ${bytes.length}-byte file`,
    );
  }
  const stripped = bytes.slice(0, directory.offset);
  const strippedView = viewOf(stripped);
  strippedView.setUint32(entry, 0, true);
  strippedView.setUint32(entry + 4, 0, true);
  return stripped;
}
