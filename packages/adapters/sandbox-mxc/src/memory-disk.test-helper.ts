import { win32 } from "node:path";
import type { MxcDisk } from "./disk.ts";

/** A disk in memory, for tests that use made-up Windows paths. Names compare without regard to case, as on Windows. */
export class MemoryDisk implements MxcDisk {
  readonly #folders = new Set<string>();
  readonly #files = new Map<string, string>();

  /** Puts a folder (and its parents) there. */
  folder(path: string): this {
    for (let folder = key(path); folder !== win32.dirname(folder); folder = win32.dirname(folder)) {
      this.#folders.add(folder);
    }
    return this;
  }

  /** Puts a file there, with its folder. */
  file(path: string, text = ""): this {
    this.folder(win32.dirname(path));
    this.#files.set(key(path), text);
    return this;
  }

  async kind(path: string): Promise<"folder" | "file" | "missing"> {
    if (this.#files.has(key(path))) return "file";
    return this.#folders.has(key(path)) ? "folder" : "missing";
  }

  async makeFolder(path: string): Promise<void> {
    this.folder(path);
  }

  async writeText(path: string, text: string): Promise<void> {
    if (!this.#folders.has(key(win32.dirname(path)))) throw new Error(`no folder for ${path}`);
    this.#files.set(key(path), text);
  }

  async readText(path: string): Promise<string | null> {
    return this.#files.get(key(path)) ?? null;
  }

  async remove(path: string): Promise<void> {
    const prefix = `${key(path)}\\`;
    for (const name of [...this.#files.keys()]) {
      if (name === key(path) || name.startsWith(prefix)) this.#files.delete(name);
    }
    for (const name of [...this.#folders]) {
      if (name === key(path) || name.startsWith(prefix)) this.#folders.delete(name);
    }
  }

  /** Every file there, by lower-case path. */
  fileNames(): string[] {
    return [...this.#files.keys()];
  }
}

function key(path: string): string {
  return win32.normalize(path).replace(/\\+$/, "").toLowerCase();
}
