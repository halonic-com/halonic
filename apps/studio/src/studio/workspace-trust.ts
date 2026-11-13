import {
  commandPaths,
  readLocalIntegrations,
  type TrustCheck,
  type TrustService,
  type TrustSubject,
  trustSubjectOf,
} from "@halonicjs/app";
import type { DefinitionSource, Digest, FolderReader } from "@halonicjs/ports";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** What {@link WorkspaceTrust} reads a folder's trust from, all through the desktop shell. */
export interface WorkspaceTrustSources {
  /** The workspace's files, as the loader reads them. */
  readonly definitions: DefinitionSource;
  /** The whole folder, with nothing left out, for the local integrations and the real location. */
  readonly folder: FolderReader;
  /** Where a program is on this computer, `undefined` when it isn't found. */
  readonly findCommand: (command: string) => Promise<string | undefined>;
  readonly digest: Digest;
  readonly trust: TrustService;
}

/**
 * Whether the workspace in one folder is trusted (`studio.workspace-trust`), read the way the
 * CLI reads it: the same loader, the same local-integration reader and the same subject, so one
 * folder gets one fingerprint in both. The page can't answer `isTrusted` on the spot, so this
 * keeps the last check and answers from it. Until the first check ends, after a check that
 * failed, and while a new check runs, the answer is no.
 *
 * @example
 * const trust = new WorkspaceTrust(sources);
 * await trust.refresh();
 * trust.name; // "Acme", from workspace.yaml
 * trust.isTrusted(); // true once a person has trusted exactly this content
 */
export class WorkspaceTrust {
  readonly #sources: WorkspaceTrustSources;
  #check: TrustCheck | undefined;
  #subject: TrustSubject | undefined;
  readonly #listeners = new Set<() => void>();
  #name: string | undefined;
  #latest = 0;

  constructor(sources: WorkspaceTrustSources) {
    this.#sources = sources;
  }

  /** The workspace's name from `workspace.yaml`, `undefined` until it is read or when it has none. */
  get name(): string | undefined {
    return this.#name;
  }

  /** The last finished check, `undefined` when none has finished or the last one failed. */
  get check(): TrustCheck | undefined {
    return this.#check;
  }

  /** Calls `listener` whenever a check starts or ends; returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Saves a person's trust in exactly the check with `shownFingerprint`, then checks again.
   * Never rejects: it says why nothing was saved.
   */
  async grant(
    shownFingerprint: string,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    const subject = this.#subject;
    if (subject === undefined) {
      return { ok: false, reason: "Halonic hasn't read this workspace yet" };
    }
    try {
      const result = await this.#sources.trust.grant(subject, shownFingerprint, "prompt");
      if (!result.ok) {
        await this.refresh();
        return { ok: false, reason: "this workspace changed" };
      }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "unknown error" };
    }
    await this.refresh();
    return this.isTrusted() ? { ok: true } : { ok: false, reason: "this workspace changed" };
  }

  /** Whether the last check found the workspace trusted. */
  isTrusted(): boolean {
    return this.#check?.status === "trusted";
  }

  /**
   * Reads the folder and checks it again. The answer is no until it ends. Never rejects: a
   * folder that can't be read leaves the workspace untrusted. When two refreshes overlap, the
   * later one wins, so an old check never answers for newer files.
   */
  async refresh(): Promise<void> {
    const mine = ++this.#latest;
    this.#check = undefined;
    this.#subject = undefined;
    this.#changed();
    try {
      const { name, check, subject } = await this.#read();
      if (mine !== this.#latest) return;
      this.#name = name;
      this.#check = check;
      this.#subject = subject;
    } catch {
      // Fails closed: no check, so no trust.
    }
    if (mine === this.#latest) this.#changed();
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }

  async #read(): Promise<{ name: string | undefined; check: TrustCheck; subject: TrustSubject }> {
    const { definitions, folder, digest, trust } = this.#sources;
    const workspace = await loadWorkspace(definitions);
    const connectors = filesOf(workspace, "connector").map((file) => file.value);
    const location = await folder.locationOf();
    if (location === null) throw new Error("The workspace folder has no location.");
    const subject = trustSubjectOf({
      workspace,
      integrations: await readLocalIntegrations(folder, digest),
      location,
      commandPaths: await commandPaths(
        connectors,
        async (command) => (await this.#sources.findCommand(command)) ?? null,
      ),
    });
    return {
      name: filesOf(workspace, "workspace")[0]?.value.name,
      check: await trust.check(subject),
      subject,
    };
  }
}
