import type {
  AccessState,
  FileHandle,
  FileSnapshot,
  FolderHandle,
  PendingWrite,
} from "./handles.ts";

/**
 * What all handles of one fake folder share: the access the page has, a
 * clock for `lastModified`, how many files were read, and a hook to race a
 * pending write. It stands in for the disk and the browser's permission.
 */
export class FakeDisk {
  /** What `queryPermission` answers. */
  access: AccessState = "granted";
  /** What `requestPermission` answers, and sets `access` to. */
  answerToRequest: AccessState = "granted";
  /** Set to make every handle call throw `NotAllowedError`, as Chromium does once access is gone. */
  refuseCalls = false;
  /** The name of each file whose text was read, in order. */
  readonly reads: string[] = [];
  /** Runs once each time a pending write is opened, before the store writes to it. */
  onWriteOpened: (() => Promise<void>) | undefined;
  readonly root: FakeFolder;
  #clock = 1;
  /** Failures to throw once, as `DOMException` names, by call and entry name. */
  readonly #failures = new Map<string, string>();

  /**
   * @param files - the folder's files, by workspace path
   * @param options - `permissionCalls: false` leaves out `queryPermission` and `requestPermission`, as browsers other than Chromium would
   */
  constructor(
    files: Readonly<Record<string, string>>,
    options: { permissionCalls?: boolean } = {},
  ) {
    this.root = new FakeFolder(this, "acme", options.permissionCalls ?? true);
    for (const [path, text] of Object.entries(files)) {
      this.writeOutside(path, text);
    }
  }

  /** Another program writes `text` to `path`, making folders on the way. */
  writeOutside(path: string, text: string): void {
    const segments = path.split("/");
    const name = segments.pop() ?? path;
    let folder = this.root;
    for (const segment of segments) {
      const entry = folder.entries.get(segment) ?? new FakeFolder(this, segment, false);
      folder.entries.set(segment, entry);
      folder = entry as FakeFolder;
    }
    const file = folder.entries.get(name);
    if (file instanceof FakeFile) {
      file.replace(text);
    } else {
      folder.entries.set(name, new FakeFile(this, folder, name, text));
    }
  }

  /** Another program removes the file or folder at `path`. */
  removeOutside(path: string): void {
    const segments = path.split("/");
    const name = segments.pop() ?? path;
    let folder: FakeFolder | undefined = this.root;
    for (const segment of segments) {
      const entry: FakeFile | FakeFolder | undefined = folder?.entries.get(segment);
      folder = entry instanceof FakeFolder ? entry : undefined;
    }
    folder?.entries.delete(name);
  }

  /** The time a change happens, always later than the one before. */
  tick(): number {
    return this.#clock++;
  }

  /** Makes the next `call` on the entry named `name` throw a `DOMException` named `error`. */
  failOnce(
    call: "getFile" | "write" | "removeEntry" | "values",
    name: string,
    error: string,
  ): void {
    this.#failures.set(`${call} ${name}`, error);
  }

  /** Throws as Chromium does when the page lost access, or as the test asked with {@link failOnce}. */
  guard(call?: string, name?: string): void {
    if (this.refuseCalls) {
      throw new DOMException("The request is not allowed.", "NotAllowedError");
    }
    const key = `${call} ${name}`;
    const failure = this.#failures.get(key);
    if (failure !== undefined) {
      this.#failures.delete(key);
      throw new DOMException(`The ${call} call failed.`, failure);
    }
  }
}

class FakeFile implements FileHandle {
  readonly kind = "file";
  readonly name: string;
  readonly #disk: FakeDisk;
  readonly #folder: FakeFolder;
  #text: string;
  #lastModified: number;

  constructor(disk: FakeDisk, folder: FakeFolder, name: string, text: string) {
    this.#disk = disk;
    this.#folder = folder;
    this.name = name;
    this.#text = text;
    this.#lastModified = disk.tick();
  }

  replace(text: string): void {
    this.#text = text;
    this.#lastModified = this.#disk.tick();
  }

  async getFile(): Promise<FileSnapshot> {
    this.#disk.guard("getFile", this.name);
    const { name } = this;
    const text = this.#text;
    const disk = this.#disk;
    return {
      lastModified: this.#lastModified,
      size: new TextEncoder().encode(text).length,
      async text() {
        disk.reads.push(name);
        return text;
      },
    };
  }

  async createWritable(): Promise<PendingWrite> {
    this.#disk.guard();
    // Chromium writes to `<name>.crswap` next to the file until the close.
    const swap = `${this.name}.crswap`;
    this.#folder.entries.set(swap, new FakeFile(this.#disk, this.#folder, swap, ""));
    let pending = "";
    const done = () => this.#folder.entries.delete(swap);
    await this.#disk.onWriteOpened?.();
    return {
      write: async (data) => {
        this.#disk.guard("write", this.name);
        pending += data;
      },
      close: async () => {
        done();
        this.replace(pending);
      },
      abort: async () => {
        done();
      },
    };
  }
}

class FakeFolder implements FolderHandle {
  readonly kind = "directory";
  readonly name: string;
  readonly entries = new Map<string, FakeFile | FakeFolder>();
  readonly #disk: FakeDisk;
  // Left out unless the fake stands for Chromium, as other browsers have neither.
  readonly queryPermission?: () => Promise<AccessState>;
  readonly requestPermission?: () => Promise<AccessState>;

  constructor(disk: FakeDisk, name: string, permissionCalls: boolean) {
    this.#disk = disk;
    this.name = name;
    if (permissionCalls) {
      this.queryPermission = async () => disk.access;
      this.requestPermission = async () => {
        disk.access = disk.answerToRequest;
        return disk.access;
      };
    }
  }

  async *values(): AsyncIterable<FakeFile | FakeFolder> {
    this.#disk.guard("values", this.name);
    yield* [...this.entries.values()];
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFolder> {
    const entry = this.#entry(name);
    if (entry instanceof FakeFolder) {
      return entry;
    }
    if (entry !== undefined) {
      throw new DOMException(`${name} is a file.`, "TypeMismatchError");
    }
    return this.#create(name, options, () => new FakeFolder(this.#disk, name, false));
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFile> {
    const entry = this.#entry(name);
    if (entry instanceof FakeFile) {
      return entry;
    }
    if (entry !== undefined) {
      throw new DOMException(`${name} is a folder.`, "TypeMismatchError");
    }
    // Chromium makes the file, empty, as soon as it is opened for writing.
    return this.#create(name, options, () => new FakeFile(this.#disk, this, name, ""));
  }

  async removeEntry(name: string): Promise<void> {
    this.#disk.guard("removeEntry", name);
    if (this.#entry(name) === undefined) {
      throw new DOMException(`There is no ${name}.`, "NotFoundError");
    }
    this.entries.delete(name);
  }

  #entry(name: string): FakeFile | FakeFolder | undefined {
    this.#disk.guard();
    return this.entries.get(name);
  }

  #create<T extends FakeFile | FakeFolder>(
    name: string,
    options: { create?: boolean },
    make: () => T,
  ): T {
    if (options.create !== true) {
      throw new DOMException(`There is no ${name}.`, "NotFoundError");
    }
    const entry = make();
    this.entries.set(name, entry);
    return entry;
  }
}
