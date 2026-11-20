import {
  focusPageHeading,
  isInWorkspaceContent,
  type KeyboardPlatform,
  type ResourceWatch,
  type Shell,
  StudioWindow,
  type WelcomeSampleProblem,
  WelcomeWindow,
  type WindowActions,
} from "@halonicjs/studio-shell";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { openWorkspaceCommand } from "../feature.ts";
import type { NewWorkspaceAsks } from "../new-workspace/new-workspace-asks.ts";
import {
  NewWorkspaceDialog,
  type NewWorkspaceHost,
} from "../new-workspace/new-workspace-dialog.tsx";
import { createdLine } from "../new-workspace/new-workspace-text.ts";
import { SampleChip } from "../sample/sample-chip.tsx";
import type { CreatedSample, SampleHost } from "../sample/sample-host.ts";
import { freshCopyFailedLine, freshCopyLine, freshCopyTryAgain } from "../sample/sample-text.ts";
import { WorkspaceTrustBadge } from "../trust/workspace-trust-badge.tsx";
import { CloseWorkspaceDialog } from "./close-workspace-dialog.tsx";
import { workspaceMenu } from "./workspace-menu.ts";
import { historyKey } from "./workspace-saving.ts";
import type { WorkspaceSwitcher } from "./workspace-switcher.ts";

/** Props for {@link WorkspaceWindow}. */
export interface WorkspaceWindowProps {
  /** The registered features and the window's announcer, close stack, engine and toasts. */
  readonly shell: Shell;
  /** The window's open workspaces and the ways to open and close them. */
  readonly switcher: WorkspaceSwitcher;
  /** Decides Ctrl or ⌘ in the key hints and the keys. */
  readonly platform: KeyboardPlatform;
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
  /** The system's region format as a language tag, such as `nl-NL`; Formats follows it. */
  readonly regionFormat?: string | undefined;
  /**
   * What the New workspace dialog needs from the app. Without it the window has no
   * **New workspace…** row or button.
   */
  readonly newWorkspace?: NewWorkspaceHost;
  /** Lets the rest of the app open the New workspace dialog, such as the finished sample card. */
  readonly newWorkspaceAsks?: NewWorkspaceAsks;
  /** What **Open demo** needs from the app. Without it Welcome has no such button. */
  readonly sample?: SampleHost;
  /**
   * The memory and free-disk watch the status bar's resources item shows. Without it the
   * item stays hidden (`shell.resource-status-item`).
   */
  readonly resources?: ResourceWatch | undefined;
}

/**
 * The desktop app's window: the Welcome screen while no workspace is open, else the shown
 * workspace's Studio window with the workspace switcher at the top of its sidebar. Ctrl 1 to
 * Ctrl 9 (⌘ on macOS) show the open workspace at that position
 * (`workspace.switcher.ctrl-number-keys`).
 *
 * @example
 * <WorkspaceWindow shell={shell} switcher={switcher} platform="windows" language="en" />
 */
export function WorkspaceWindow({
  shell,
  switcher,
  platform,
  language,
  regionFormat,
  newWorkspace,
  newWorkspaceAsks,
  sample,
  resources,
}: WorkspaceWindowProps) {
  const { open } = switcher;
  const showByPerson = useShowByPerson(switcher, (line) => shell.announcer.announce(line));
  const [creating, setCreating] = useState(false);
  const askNewWorkspace = newWorkspace === undefined ? undefined : () => setCreating(true);
  useEffect(
    () =>
      askNewWorkspace === undefined ? undefined : newWorkspaceAsks?.subscribe(askNewWorkspace),
    // The dialog opens through `setCreating`, which never changes; the ask is rebuilt each render.
    [newWorkspace, newWorkspaceAsks],
  );
  // What Open demo and Fresh copy do with the host's answer: a copy or a known sample opens.
  const openSample = async (
    made: Exclude<CreatedSample, { kind: "cant" }>,
    toastOf: (name: string, trustFailure?: string) => string,
  ): Promise<void> => {
    if (made.kind === "existing") {
      await showByPerson(() => switcher.fromMenu(() => switcher.openLocation(made.folder)));
      return;
    }
    const toast = toastOf(
      made.name,
      made.trust.kind === "not-saved" ? made.trust.reason : undefined,
    );
    // Marked as the sample while it opens, so Home's first frame already knows it is one.
    await showByPerson(() =>
      switcher.fromMenu(() => switcher.openLocation(made.folder, toast, true)),
    );
  };
  const knownSamples = () =>
    switcher.recent.list().flatMap((each) => (each.sample === true ? [each.location] : []));
  const trySample =
    sample === undefined
      ? undefined
      : async (): Promise<WelcomeSampleProblem | undefined> => {
          const made = await sample.create(knownSamples());
          if (made.kind === "cant") {
            return {
              folder: made.folder,
              reason: made.reason,
              ...(made.unavailable === true ? { unavailable: true as const } : {}),
            };
          }
          await openSample(made, createdLine);
          return undefined;
        };
  // A second press while a copy is being written would write a second one.
  const freshCopyRunning = useRef(false);
  const freshCopy =
    sample === undefined
      ? undefined
      : async function copyFresh(): Promise<void> {
          if (freshCopyRunning.current) return;
          freshCopyRunning.current = true;
          try {
            const made = await sample.create([]);
            if (made.kind === "cant") {
              shell.toasts.show({
                tone: "danger",
                title: freshCopyFailedLine(made.reason),
                sticky: true,
                action: { label: freshCopyTryAgain, onClick: () => void copyFresh() },
              });
              return;
            }
            await openSample(made, freshCopyLine);
          } finally {
            freshCopyRunning.current = false;
          }
        };
  const shown = useSyncExternalStore(
    (onChange) => open.subscribe(onChange),
    () => open.shown,
  );
  // The menu reads Recent as it draws, so a row removed from a toast goes at once.
  useSyncExternalStore(
    (onChange) => switcher.recent.subscribe(onChange),
    () => switcher.recent.version,
  );
  const busy = useSyncExternalStore(
    (onChange) => switcher.subscribe(onChange),
    () => switcher.busy,
  );
  const closeRequest = useSyncExternalStore(
    (onChange) => switcher.subscribe(onChange),
    () => switcher.closeRequest,
  );
  const retrying = useSyncExternalStore(
    (onChange) => switcher.subscribe(onChange),
    () => switcher.retrying,
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const position = workspaceKeyPosition(event, platform);
      if (position !== undefined) {
        event.preventDefault();
        void showByPerson(() => switcher.showAt(position));
        return;
      }
      const history = historyKey(event, platform);
      const saving = switcher.open.shown?.value.saving;
      // A field of workspace content has no undo of its own; any other field keeps its own.
      const ownUndo = isEditing(event.target) && !isInWorkspaceContent(event.target);
      if (history !== undefined && saving !== undefined && !ownUndo) {
        event.preventDefault();
        if (history === "undo") saving.undo();
        else saving.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [switcher, platform, showByPerson]);

  const dialog =
    creating && newWorkspace !== undefined ? (
      <NewWorkspaceDialog
        host={newWorkspace}
        announce={(line) => shell.announcer.announce(line)}
        onCancel={() => setCreating(false)}
        onOpen={(folder) => {
          setCreating(false);
          void showByPerson(() => switcher.fromMenu(() => switcher.openLocation(folder)));
        }}
        onCreated={(folder, name, trust) => {
          setCreating(false);
          const toast = createdLine(name, trust.kind === "not-saved" ? trust.reason : undefined);
          void showByPerson(() => switcher.fromMenu(() => switcher.openLocation(folder, toast)));
        }}
      />
    ) : null;
  if (shown === undefined) {
    return (
      <>
        <WelcomeWindow
          shell={shell}
          language={language}
          onOpenFolder={() => showByPerson(() => switcher.pickAndOpen())}
          onNewWorkspace={askNewWorkspace}
          onTrySample={trySample}
          recent={{
            workspaces: switcher.recent.list(),
            onOpen: (location) => showByPerson(() => switcher.openLocation(location)),
            onRemove: (location) => switcher.removeFromRecent(location),
          }}
        />
        {dialog}
      </>
    );
  }
  const menu = (window: WindowActions) =>
    workspaceMenu({
      recent: switcher.recent.list(),
      open: open.all.map((slot) => slot.location),
      shown: shown.location,
      platform,
      onOpen: (location) =>
        void showByPerson(() => switcher.fromMenu(() => switcher.openLocation(location), true)),
      ...(askNewWorkspace === undefined ? {} : { onNewWorkspace: askNewWorkspace }),
      onOpenFolder: () => void showByPerson(() => switcher.fromMenu(() => switcher.pickAndOpen())),
      onWorkspaceSettings: () => window.runCommand(openWorkspaceCommand),
      onClose: () => void showByPerson(() => switcher.closeShown()),
    });
  return (
    <>
      {/* Each workspace keeps its own tabs in its StudioWorkspace; the key starts its window afresh. */}
      <StudioWindow
        key={shown.location}
        shell={shell}
        workspace={shown.value.workspace}
        host="desktop-app"
        platform={platform}
        language={language}
        regionFormat={regionFormat}
        resources={resources}
        switcher={{ workspace: { name: shown.value.name, folder: shown.location }, menu, busy }}
        badges={
          <>
            {shown.value.trust === undefined ? null : (
              <WorkspaceTrustBadge
                trust={shown.value.trust}
                name={shown.value.name}
                toasts={shell.toasts}
                badges={shell.badges}
              />
            )}
            {freshCopy === undefined || !switcher.recent.isSample(shown.location) ? null : (
              <SampleChip
                trust={shown.value.trust}
                testModel={shown.value.testModel}
                onNewWorkspace={askNewWorkspace}
                onFreshCopy={() => void freshCopy()}
              />
            )}
          </>
        }
      />
      {dialog}
      {closeRequest === undefined ? null : (
        <CloseWorkspaceDialog
          request={closeRequest}
          onCancel={() => switcher.cancelClose()}
          onCloseAnyway={() => void showByPerson(() => switcher.closeAnyway())}
          onTryAgain={() => void showByPerson(() => switcher.tryCloseAgain())}
          busy={retrying}
        />
      )}
    </>
  );
}

/**
 * Gives the way to run what a person does to open, show or close a workspace. When it ends with
 * another workspace shown, focus moves to that workspace's page title once it is drawn, because the
 * window the focus was in is gone (a11y W1). When that workspace was already open, the announcer
 * also reads "Switched to *name*", since the title alone ("Home") can be the same in both
 * workspaces and a switch has no "Opened …" toast (a11y W1b). A restore at start doesn't run
 * through it, so it leaves focus alone, and closing the last workspace leaves it to Welcome, which
 * focuses **Open folder**.
 */
function useShowByPerson(
  switcher: WorkspaceSwitcher,
  announce: (text: string) => void,
): <T>(change: () => T | Promise<T>) => Promise<T> {
  // Counts the shows, so the focus moves after the commit that draws the new workspace.
  const [shows, setShows] = useState(0);
  // The name to read once the focus has moved, when the shown workspace was already open.
  const switchedTo = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (shows === 0) {
      return;
    }
    focusPageHeading();
    const name = switchedTo.current;
    switchedTo.current = undefined;
    if (name !== undefined) {
      announce(switchedLine(name));
    }
  }, [shows]);
  return useCallback(
    async <T,>(change: () => T | Promise<T>): Promise<T> => {
      const before = switcher.open.shown?.location;
      const openBefore = new Set(switcher.open.all.map((slot) => slot.location));
      const result = await change();
      const after = switcher.open.shown;
      if (after !== undefined && after.location !== before) {
        switchedTo.current = openBefore.has(after.location) ? after.value.name : undefined;
        setShows((count) => count + 1);
      }
      return result;
    },
    [switcher],
  );
}

/** What a screen reader hears when an open workspace is shown again, such as "Switched to Acme". */
function switchedLine(name: string): string {
  return `Switched to ${name}`;
}

/** Whether a key press happened in a field that has its own undo. */
function isEditing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * The position Ctrl 1 to Ctrl 9 (⌘1 to ⌘9 on macOS) asks for, without Alt or Shift, which stay
 * with other keys (Alt 1 is the Explorer's).
 */
export function workspaceKeyPosition(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  platform: KeyboardPlatform,
): number | undefined {
  const mod =
    platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod || event.altKey || event.shiftKey || !/^[1-9]$/.test(event.key)) {
    return undefined;
  }
  return Number(event.key);
}
