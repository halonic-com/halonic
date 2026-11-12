import { win32 } from "node:path";
import type { MxcDisk } from "./disk.ts";

/** A disk in memory, for tests that use made-up Windows paths. Names compare without regard to case, as on Windows. */
export class MemoryDisk implements MxcDisk {
  readonly #folders = new Set<string>();
  readonly #files = new Map<string, string>();
  readonly #links = new Map<string, string>();

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

  /** Makes `path` a link (or junction) to `target`, which a file or folder may be. */
  link(path: string, target: string): this {
    this.folder(win32.dirname(path));
    this.#links.set(key(path), target);
    return this;
  }

  async realPath(path: string): Promise<string | null> {
    const resolved = this.#follow(path);
    return (await this.kind(resolved)) === "missing" ? null : resolved;
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

  async copyFile(from: string, to: string): Promise<void> {
    const text = this.#files.get(key(this.#follow(from)));
    if (text === undefined) throw new Error(`no file ${from}`);
    await this.writeText(to, text);
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

  /** `path` with every link on it followed, from the top folder down. */
  #follow(path: string): string {
    let resolved = path;
    for (let hops = 0; hops < 16; hops++) {
      const link = [...this.#links].find(([from]) => isUnder(from, key(resolved)));
      if (link === undefined) return resolved;
      const [from, target] = link;
      resolved = target + key(resolved).slice(from.length);
    }
    throw new Error(`too many links on ${path}`);
  }

  /** Every file there, by lower-case path. */
  fileNames(): string[] {
    return [...this.#files.keys()];
  }
}

function key(path: string): string {
  return win32.normalize(path).replace(/\\+$/, "").toLowerCase();
}

function isUnder(folder: string, path: string): boolean {
  return path === folder || path.startsWith(`${folder}\\`);
}
