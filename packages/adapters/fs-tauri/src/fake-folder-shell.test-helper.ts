import { checkWorkspacePath } from "@halonicjs/ports";
import { encodeBase64url } from "@halonicjs/std";
import type { FolderTree } from "@halonicjs/testing-contracts";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { FolderRefusal, FolderRefusalKind } from "./folder-commands.ts";
import type { TauriShell } from "./shell.ts";

const encoder = new TextEncoder();

/**
 * A shell that answers the `folder_*` commands as the Rust shell does,
 * written out on its own rather than from the adapter: one tree of files,
 * folders, links and special files for the folder the person opened. It
 * hides no name, lists a link as a link and refuses any path through one,
 * never opens a special file, and checks every path again with the port's
 * rules. Bytes cross as base64url. It answers only for the workspace
 * `opened` names.
 *
 * Every call is kept in `calls`.
 */
export class FakeFolderShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  readonly #tree: FolderTree;
  readonly #opened: string;
  readonly #granted: boolean;
  #nextRefusal: FolderRefusalKind | undefined;
  #nextAnswer: { readonly value: unknown } | undefined;

  /**
   * @param options.opened - the folder the person opened in the shell
   * @param options.tree - what the folder holds
   * @param options.granted - whether the page has the capability for the folder commands; the served Studio doesn't
   */
  constructor(options: { opened: string; tree: FolderTree; granted?: boolean }) {
    this.#opened = options.opened;
    this.#tree = options.tree;
    this.#granted = options.granted ?? true;
  }

  /** Makes the next call fail this way, before anything is read. */
  refuseNext(kind: FolderRefusalKind): void {
    this.#nextRefusal = kind;
  }

  /** Makes the next call answer `value`, whatever it asked. */
  answerNext(value: unknown): void {
    this.#nextAnswer = { value };
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (!this.#granted) {
      // What Tauri rejects with for a command the capability doesn't allow: text, not a refusal.
      throw `Command ${command} not allowed by ACL`;
    }
    if (this.#nextRefusal !== undefined) {
      const kind = this.#nextRefusal;
      this.#nextRefusal = undefined;
      throw refusal(kind, `refused by the test (${kind})`);
    }
    if (this.#nextAnswer !== undefined) {
      const { value } = this.#nextAnswer;
      this.#nextAnswer = undefined;
      return value;
    }
    if (args["workspace"] !== this.#opened) {
      throw refusal("folder_not_open", "the folder isn't open");
    }
    switch (command) {
      case "folder_entries":
        return this.#entries(
          args["dir"] as string | null,
          args["limit"] as number | null,
          args["recursive"] as boolean,
        );
      case "folder_read":
        return this.#read(this.#checked(args["path"]));
      case "folder_location":
        return this.#location(args["path"] as string | null);
      default:
        throw `Command ${command} not found`;
    }
  }

  /** Every file, folder, link and special file, by path, with the folders above each implied. */
  #all(): Map<string, { kind: "file" | "folder" | "link" | "other"; size?: number }> {
    const all = new Map<string, { kind: "file" | "folder" | "link" | "other"; size?: number }>();
    const add = (path: string, kind: "file" | "folder" | "link" | "other", size?: number) => {
      const parts = path.split("/");
      for (let depth = 1; depth < parts.length; depth++) {
        all.set(parts.slice(0, depth).join("/"), { kind: "folder" });
      }
      all.set(path, size === undefined ? { kind } : { kind, size });
    };
    for (const [path, content] of Object.entries(this.#tree.files ?? {})) {
      add(
        path,
        "file",
        typeof content === "string" ? encoder.encode(content).length : content.length,
      );
    }
    for (const path of this.#tree.folders ?? []) add(path, "folder");
    for (const path of Object.keys(this.#tree.links ?? {})) add(path, "link");
    for (const path of this.#tree.special ?? []) add(path, "other");
    return all;
  }

  #checked(path: unknown): string {
    try {
      checkWorkspacePath(String(path));
    } catch {
      throw refusal("unsafe_path", "the path is unsafe");
    }
    return String(path);
  }

  /** What is at `path`; a link in any segment is refused, as the shell refuses it. */
  #at(path: string): { kind: "file" | "folder" | "link" | "other"; size?: number } | undefined {
    const all = this.#all();
    const parts = path.split("/");
    for (let depth = 1; depth <= parts.length; depth++) {
      if (all.get(parts.slice(0, depth).join("/"))?.kind === "link") {
        throw refusal("private_path", "the path goes through a link");
      }
    }
    return all.get(path);
  }

  #entries(dir: string | null, limit: number | null, recursive: boolean): unknown {
    const base = dir === null ? undefined : this.#checked(dir);
    if (base !== undefined && this.#at(base)?.kind !== "folder") {
      return [];
    }
    const prefix = base === undefined ? "" : `${base}/`;
    const found = [...this.#all()]
      .filter(([path]) => path.startsWith(prefix) && path !== base)
      .filter(([path]) => recursive || !path.slice(prefix.length).includes("/"))
      .map(([path, entry]) => ({ path, ...entry }))
      .sort((left, right) => (left.path < right.path ? -1 : 1));
    return limit === null ? found : found.slice(0, limit + 1);
  }

  #read(path: string): string | null {
    const entry = this.#at(path);
    if (entry === undefined || entry.kind === "folder") return null;
    if (entry.kind === "other") throw refusal("special_path", "a special file is never opened");
    // Only a file is left here, and every file is in the tree's files.
    const content = this.#tree.files?.[path] as string | Uint8Array;
    return encodeBase64url(typeof content === "string" ? encoder.encode(content) : content);
  }

  #location(path: string | null): string | null {
    if (path === null) return this.#opened;
    const checked = this.#checked(path);
    return this.#at(checked) === undefined ? null : `${this.#opened}/${checked}`;
  }
}

function refusal(kind: FolderRefusalKind, message: string): FolderRefusal {
  return { kind, message };
}
