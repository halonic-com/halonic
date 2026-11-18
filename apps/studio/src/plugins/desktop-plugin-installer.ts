import { TauriPluginInstallSource, type TauriShell } from "@halonicjs/adapter-fs-tauri";
import type { PluginAddRefusal, PluginService, PluginSource } from "@halonicjs/app";
import type { FolderReader } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import type { PluginsHost } from "@halonicjs/studio-feature-plugins/api";

/** The Add plugin dialog's installer, as the plugins host gives it. */
type PluginInstaller = NonNullable<PluginsHost["installer"]>;
type PluginAddSource = Parameters<PluginInstaller["add"]>[0];
type PluginAddOutcome = Awaited<ReturnType<PluginInstaller["add"]>>;

/** What {@link desktopPluginInstaller} uses of core's `PluginService`. */
export type PluginInstallerService = Pick<PluginService, "add">;

/** What {@link desktopPluginInstaller} is made of. */
export interface DesktopPluginInstallerParts {
  /** The shell's IPC: the folder picker, the git export and the plugins folder. */
  readonly ipc: TauriShell;
  readonly service: PluginInstallerService;
  /** Reads the plugins folder again, so the plugin just added is in the feed. */
  readonly reload: () => Promise<void>;
  /** Told when the plugin was added but reading the folder again failed. */
  readonly onReloadFailed: (error: unknown) => void;
}

/** What git says when the computer or the host is not reachable, which the dialog words as offline. */
const unreachable =
  /could not resolve host|network is unreachable|connection (?:timed out|refused|reset)|could not connect|unable to connect|temporary failure in name resolution/iu;

/**
 * The Add plugin dialog's installer for the desktop app (`studio.desktop-plugin-installer`).
 * It copies nothing and runs nothing: the shell gives it a place to read from, either the
 * folder the person picked with **Choose folder…** or one commit of a git repository the shell
 * exported, core's `PluginService.add` reads that place once, checks and hashes it, and the
 * shell places exactly those bytes, not trusted. The person trusts it afterwards, in the
 * dialog that follows. A folder the person typed instead of picking is refused by the shell
 * with a sentence that says to use Choose folder. Closing the dialog stops git and removes the
 * exported folder; a finished add removes it too.
 *
 * @example
 * const installer = desktopPluginInstaller({ ipc, service, reload, onReloadFailed });
 * const outcome = await installer.add({ kind: "git", address }, signal);
 */
export function desktopPluginInstaller({
  ipc,
  service,
  reload,
  onReloadFailed,
}: DesktopPluginInstallerParts): PluginInstaller {
  const source = new TauriPluginInstallSource(ipc);

  async function addFrom(
    reader: FolderReader,
    from: PluginSource,
    signal: AbortSignal,
  ): Promise<PluginAddOutcome> {
    stopIfAborted(signal);
    const added = await service.add(stoppable(reader, signal), { from, replace: false });
    if (!added.ok) return refusedOutcome(added.error);
    // The plugin is in place; a failed re-read doesn't undo it, and the next reload shows it.
    await reload().catch(onReloadFailed);
    return { kind: "added", plugin: added.value.folder };
  }

  async function addFromGit(
    address: string,
    reference: string | undefined,
    signal: AbortSignal,
  ): Promise<PluginAddOutcome> {
    let exported: Awaited<ReturnType<TauriPluginInstallSource["exportGit"]>>;
    try {
      exported = await source.exportGit(address, reference, signal);
    } catch (error) {
      const host = unreachableHost(error, address);
      if (host !== undefined) return { kind: "offline", host };
      throw error;
    }
    try {
      return await addFrom(
        exported.reader,
        { kind: "git", address, commit: exported.commit },
        signal,
      );
    } finally {
      await exported.end();
    }
  }

  return {
    chooseFolder: () => source.pick(),
    add: async (from: PluginAddSource, signal: AbortSignal) =>
      from.kind === "folder"
        ? await addFrom(source.reader(from.path), { kind: "folder", path: from.path }, signal)
        : await addFromGit(from.address, from.ref, signal),
  };
}

/** Rejects with the `conflict` error of an add that was stopped, the same as a stopped git export. */
function stopIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new KindedError("conflict", "Adding the plugin was stopped.");
}

/** `reader` that refuses every read once `signal` aborts, so a closed dialog stops a folder add before it is placed. */
function stoppable(reader: FolderReader, signal: AbortSignal): FolderReader {
  return {
    location: reader.location,
    entries: async (dir, options) => {
      stopIfAborted(signal);
      return await reader.entries(dir, options);
    },
    read: async (path) => {
      stopIfAborted(signal);
      return await reader.read(path);
    },
    locationOf: async (path) => {
      stopIfAborted(signal);
      return await reader.locationOf(path);
    },
  };
}

/** What core refused, as the dialog words it. */
function refusedOutcome(refusal: PluginAddRefusal): PluginAddOutcome {
  if (refusal.kind === "taken") return { kind: "taken", plugin: refusal.id };
  const missing = refusal.problems.some((problem) => problem.code === "manifest-missing");
  if (missing) return { kind: "no-manifest" };
  return {
    kind: "broken",
    problems: refusal.problems.map(({ file, path, message }) => ({ file, path, message })),
  };
}

/** The host of `address` when `error` says git couldn't reach it, or `undefined` for any other failure. */
function unreachableHost(error: unknown, address: string): string | undefined {
  if (errorKindOf(error) !== "unavailable") return undefined;
  const message = error instanceof Error ? error.message : "";
  if (!unreachable.test(message)) return undefined;
  return URL.canParse(address) ? new URL(address).hostname : undefined;
}
