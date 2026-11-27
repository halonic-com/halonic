import {
  type AssistantAddedHosts,
  commandPaths,
  connectorFiles,
  readLocalIntegrations,
  type TrustCheck,
  type TrustCheckOptions,
  type TrustService,
  type TrustSubject,
  trustSubjectOf,
} from "@halonicjs/app";
import type { DefinitionSource, Digest, FolderReader } from "@halonicjs/ports";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  reachesOnlyTheTestModel,
} from "@halonicjs/workspace";

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
 * failed, and while a new check runs, the answer is no. While a new check runs, {@link check}
 * still holds the last settled one, so the window doesn't flicker on every save.
 *
 * Only {@link refresh}, which reads the files itself, may shrink the trust record to files that
 * lost something. A check of a workspace the caller loaded never writes the record: by the time
 * it runs, a person may have saved and trusted more, such as a connector added while the engine
 * kept its copy of the files, and shrinking to that older load would undo the trust (HAL-16381).
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
  #failure: string | undefined;
  /** Whether the settled check may answer `isTrusted`: false while a new check runs. */
  #settled = false;
  #subject: TrustSubject | undefined;
  #needsNoTrust = false;
  readonly #listeners = new Set<() => void>();
  #name: string | undefined;
  #loaded: LoadedWorkspace | undefined;
  #latest = 0;
  #assistantAdded: AssistantAddedHosts = new Map();

  constructor(sources: WorkspaceTrustSources) {
    this.#sources = sources;
  }

  /** The workspace's name from `workspace.yaml`, `undefined` until it is read or when it has none. */
  get name(): string | undefined {
    return this.#name;
  }

  /**
   * The workspace the last finished {@link refresh} loaded, `undefined` before one ends and after
   * one failed, so what opens with the check, such as the runs, needn't load the files again.
   */
  get loaded(): LoadedWorkspace | undefined {
    return this.#loaded;
  }

  /**
   * The last finished check, kept while a new one runs, `undefined` when none has finished or
   * the last one failed. Only for showing: {@link isTrusted} is no while a check runs.
   */
  get check(): TrustCheck | undefined {
    return this.#check;
  }

  /**
   * Whether the last check found nothing to trust (HAL-10131): every provider is the test model
   * and no connector, agent program or local integration is there, the rule the CLI skips trust
   * by. The workspace still counts as not trusted; there is just nothing to ask about.
   */
  get needsNoTrust(): boolean {
    return this.#check !== undefined && this.#needsNoTrust;
  }

  /**
   * Why the last check failed, `undefined` while a check runs and after one that finished. Shown
   * as "Couldn't load workspace settings" with a way to try again.
   */
  get failure(): string | undefined {
    return this.#failure;
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

  /**
   * Forgets the person's trust in this folder, then checks again, so the workspace asks again
   * before it runs anything. Never rejects: it says why the trust is still there.
   */
  async remove(): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string; readonly error?: unknown }
  > {
    const location = this.#subject?.location;
    if (location === undefined) {
      return { ok: false, reason: "Halonic hasn't read this workspace yet" };
    }
    try {
      await this.#sources.trust.revoke(location);
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "unknown error",
        error,
      };
    }
    await this.refresh();
    return { ok: true };
  }

  /**
   * Checks the trust of a workspace the caller already loaded, so a caller that starts something
   * checks the very content it starts from, never a second read of the files. Changes nothing,
   * the trust record included: the page's last check, its listeners and its subject stay as they
   * are.
   */
  async checkLoaded(workspace: LoadedWorkspace): Promise<TrustCheck> {
    return (await this.#checkSubject(workspace, LOADED)).check;
  }

  /**
   * Whether something may start from a workspace the caller already loaded, by the rule the CLI
   * starts runs by (`needsNoTrust`, HAL-1984, HAL-12409): a person trusted exactly this content,
   * or it can only reach the test model. Never writes the trust record ({@link checkLoaded}).
   * Never rejects: a check that fails is a no.
   */
  async mayStart(workspace: LoadedWorkspace): Promise<boolean> {
    try {
      const { check, subject } = await this.#checkSubject(workspace, LOADED);
      return check.status === "trusted" || reachesOnlyTheTestModel(subject);
    } catch {
      return false;
    }
  }

  /**
   * {@link mayStart} from the last check, for a page that asks before it starts: no until the
   * first check ends, while a check runs and after one that failed.
   */
  mayStartNow(): boolean {
    return this.#settled && (this.#check?.status === "trusted" || this.needsNoTrust);
  }

  /** Whether the last check found the workspace trusted. */
  isTrusted(): boolean {
    return this.#settled && this.#check?.status === "trusted";
  }

  /**
   * Reads the folder and checks it again. The answer is no until it ends. Never rejects: a
   * folder that can't be read leaves the workspace untrusted. When two refreshes overlap, the
   * later one wins, so an old check never answers for newer files.
   */
  async refresh(): Promise<void> {
    const mine = ++this.#latest;
    this.#settled = false;
    this.#failure = undefined;
    this.#changed();
    try {
      const workspace = await loadWorkspace(this.#sources.definitions);
      const { check, subject } = await this.#checkSubject(workspace, { readOnly: false });
      const name = filesOf(workspace, "workspace")[0]?.value.name;
      if (mine !== this.#latest) return;
      this.#name = name;
      this.#loaded = workspace;
      this.#check = check;
      this.#subject = subject;
      this.#needsNoTrust = reachesOnlyTheTestModel(subject);
      this.#settled = true;
    } catch (error) {
      // Fails closed: no check, so no trust.
      if (mine === this.#latest) {
        this.#check = undefined;
        this.#loaded = undefined;
        this.#subject = undefined;
        this.#needsNoTrust = false;
        this.#failure =
          error instanceof Error && error.message !== "" ? error.message : "unknown error";
      }
    }
    if (mine === this.#latest) this.#changed();
  }

  /**
   * The hosts the assistant added to local integrations' sheets that the person didn't name
   * (HAL-525), for the Reaches row's mark. Empty until {@link followAssistantAdded} reads them.
   */
  get assistantAdded(): AssistantAddedHosts {
    return this.#assistantAdded;
  }

  /**
   * Reads the assistant-added hosts with `read` now and each time `onChange` fires, as after an
   * Accept. The check stays as it is: only the listeners hear of it. A read that fails counts as
   * none.
   *
   * @returns the way to stop
   */
  followAssistantAdded(
    read: () => Promise<AssistantAddedHosts>,
    onChange: (listener: () => void) => () => void,
  ): () => void {
    let latest = 0;
    const reread = async () => {
      const mine = ++latest;
      const marks = await read().catch(() => new Map());
      if (mine !== latest) return;
      this.#assistantAdded = marks;
      this.#changed();
    };
    void reread();
    return onChange(() => void reread());
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }

  async #checkSubject(
    workspace: LoadedWorkspace,
    options: TrustCheckOptions,
  ): Promise<{ check: TrustCheck; subject: TrustSubject }> {
    const { folder, digest, trust } = this.#sources;
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
      connectorFiles: await connectorFiles(connectors, folder, digest),
    });
    return { check: await trust.check(subject, options), subject };
  }
}

/** How a workspace the caller loaded is checked: never writing the record. */
const LOADED: TrustCheckOptions = { readOnly: true };
