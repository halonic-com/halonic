// The parts of the File System Access API this adapter uses, written out
// here: TypeScript's DOM types leave out the permission calls and
// `showDirectoryPicker`, which only Chromium browsers have. The browser's own
// handles fit these shapes, and so does the in-memory fake the tests use.

/** What `queryPermission` and `requestPermission` answer. */
export type AccessState = "granted" | "denied" | "prompt";

/** The access a store asks for: it reads and writes. */
export interface AccessRequest {
  readonly mode: "readwrite";
}

/** A file's text and what the browser knows about it without reading it. */
export interface FileSnapshot {
  /** When the file last changed, in milliseconds since 1970. */
  readonly lastModified: number;
  /** Its length in bytes. */
  readonly size: number;
  /** Its text, decoded as UTF-8. */
  text(): Promise<string>;
}

/**
 * Where a write goes before it lands: the browser keeps it apart and puts it
 * in place in one step on `close()`, or drops it on `abort()`.
 */
export interface PendingWrite {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/** A file in the opened folder, as `FileSystemFileHandle`. */
export interface FileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<FileSnapshot>;
  createWritable(): Promise<PendingWrite>;
}

/** A folder in the opened folder, or the opened folder itself, as `FileSystemDirectoryHandle`. */
export interface FolderHandle {
  readonly kind: "directory";
  readonly name: string;
  /** The entries in this folder, in no set order. */
  values(): AsyncIterable<FileHandle | FolderHandle>;
  /** @throws DOMException `NotFoundError` when there is none and `create` is not set, `TypeMismatchError` when it is a file */
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FolderHandle>;
  /** @throws DOMException `NotFoundError` when there is none and `create` is not set, `TypeMismatchError` when it is a folder */
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  /** @throws DOMException `NotFoundError` when there is no such entry */
  removeEntry(name: string): Promise<void>;
  /** Chromium only: whether the page may still use the folder. */
  queryPermission?(request: AccessRequest): Promise<AccessState>;
  /** Chromium only: asks the person, so it must run from a click or a key press. */
  requestPermission?(request: AccessRequest): Promise<AccessState>;
}

/** The browser's folder picker, as `window.showDirectoryPicker`. */
export type FolderPicker = (options: {
  readonly mode: "readwrite";
  readonly id?: string;
}) => Promise<FolderHandle>;
