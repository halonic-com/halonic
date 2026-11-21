import {
  Button,
  CommandBox,
  ContextMenu,
  type ContextMenuTarget,
  DashedRingIcon,
  EmptyState,
  LetterTile,
  List,
  type ListRow,
  type MenuEntry,
  StatusChip,
  ViewOnlyLine,
} from "@halonicjs/studio-kit";
import type { StudioHost } from "@halonicjs/studio-shell";
import { type ReactNode, useState } from "react";
import { trustedDay } from "../page/page-text.ts";
import {
  OPEN_FOLDER,
  type PluginActions,
  REMOVE_PLUGIN_ELLIPSIS,
  REMOVE_TRUST,
} from "../page/plugin-actions.ts";
import type { InstalledPlugin } from "../page/plugin-pages.ts";
import { RemovePluginDialog } from "../page/remove-plugin-dialog.tsx";
import { usePageActions } from "../page/use-page-actions.ts";
import { pluginsViewOnly } from "../page/view-only.ts";
import { asksAboutYes, useOffHere } from "../trust/off-here.ts";
import {
  ADD_COMMAND,
  ADD_PLUGIN,
  BUILT_IN_CHIP,
  BUILT_IN_HEADING,
  CHANGED_CHIP,
  COMES_WITH_HALONIC,
  EMPTY_LINE,
  EMPTY_TITLE,
  errorsChip,
  INSTALLED_HEADING,
  LOAD_FAILED_TITLE,
  LOADING_LABEL,
  moreFor,
  NOT_TRUSTED_CHIP,
  OFF_HERE_CHIP,
  OPEN,
  OPEN_IN_NEW_TAB,
  PLUGINS,
  rowMeta,
  TRY_AGAIN,
  viewOnlyLine,
} from "./list-text.ts";

/** A plugin that comes with Halonic, such as Gmail and Google Drive. It has no page of its own. */
export interface BuiltInPlugin {
  readonly id: string;
  readonly name: string;
}

/** What comes with Halonic: one row for the Google connectors, which Library › Connectors shows per account. */
export const BUILT_IN_PLUGINS: readonly BuiltInPlugin[] = [
  { id: "google", name: "Gmail and Google Drive" },
];

/** Whether the installed plugins have loaded, so the list can show a skeleton or why not. */
export type PluginsLoad =
  | { readonly kind: "loading" }
  | {
      readonly kind: "failed";
      readonly reason: string;
      /** **Try again** is reading: its button is busy and keeps the focus. */
      readonly trying?: boolean;
    }
  | { readonly kind: "ready" };

/** The props of `PluginsList`. */
export interface PluginsListProps {
  readonly load: PluginsLoad;
  readonly plugins: readonly InstalledPlugin[];
  readonly builtIn: readonly BuiltInPlugin[];
  readonly actions: PluginActions;
  /** Enter or a click on an installed plugin: its page opens. */
  readonly onOpen: (plugin: string) => void;
  /** Ctrl Enter, a Ctrl-click, a middle click or **Open in new tab**. */
  readonly onOpenInNewTab: (plugin: string) => void;
  /** Open on a built-in plugin. Without it, a built-in row opens nothing and has no ⋮. */
  readonly onOpenBuiltIn?: (id: string) => void;
  /** **Add plugin**: opens the Add plugin dialog. Without it, **Add plugin** is not shown. */
  readonly onAdd?: () => void;
  /** **Try again** after the list couldn't load. */
  readonly onRetry: () => void;
  /**
   * Where Studio is shown: `app` (the default) or `served`, a browser on `halonic serve`.
   * Plugins are view only on a phone and when served (design section 10).
   */
  readonly place?: "app" | "served";
  /** Where the window runs (`context.host`): the desktop app (the default), served, or a phone. */
  readonly host?: StudioHost | undefined;
  /**
   * The level of the two lists' headings: 2 (the default) where the list is the page, 4 inside
   * Settings, under the section's h3. An empty list's title goes one below (HAL-12536).
   */
  readonly headingLevel?: 2 | 4;
  readonly now?: () => Date;
}

const BUILT_IN_PREFIX = "built-in:";

/** An installed plugin's ⋮: only the two ways to open it when view only. */
function installedMenu(
  plugin: InstalledPlugin,
  viewOnly: boolean,
  handlers: Parameters<typeof installedEntries>[1],
): MenuEntry[] {
  if (!viewOnly) return installedEntries(plugin, handlers);
  return [
    { id: "open", label: OPEN, onSelect: handlers.open },
    { id: "tab", label: OPEN_IN_NEW_TAB, onSelect: handlers.openInNewTab },
  ];
}

/** A built-in plugin's ⋮: only Open, and nothing when the host can't open one. */
function builtInEntries(
  id: string | undefined,
  open: ((id: string) => void) | undefined,
): MenuEntry[] {
  if (id === undefined || open === undefined) return [];
  return [{ id: "open", label: OPEN, onSelect: () => open(id) }];
}

/** A built-in row is only openable when the host can open one, so Enter never does nothing. */
function builtInOpener(onOpenBuiltIn: ((id: string) => void) | undefined) {
  if (onOpenBuiltIn === undefined) return {};
  return { onOpen: (id: string) => onOpenBuiltIn(id.slice(BUILT_IN_PREFIX.length)) };
}

/** The built-in rows. Without a way to open one, a row has no ⋮. */
function builtInRowsOf(
  builtIn: readonly BuiltInPlugin[],
  canOpen: boolean,
  openMore: (id: string) => (event: { readonly currentTarget: HTMLElement }) => void,
): ListRow[] {
  return builtIn.map((plugin): ListRow => {
    const id = `${BUILT_IN_PREFIX}${plugin.id}`;
    return {
      id,
      title: plugin.name,
      avatar: <LetterTile name={plugin.name} />,
      meta: COMES_WITH_HALONIC,
      trailing: <StatusChip tone="neutral">{BUILT_IN_CHIP}</StatusChip>,
      ...(canOpen ? { more: { label: moreFor(plugin.name), onClick: openMore(id) } } : {}),
    };
  });
}

/** The line above the command a view-only list ends with; the app always has an installer (HAL-12642). */
function commandLine(viewOnly: boolean, phone: boolean): string | undefined {
  return viewOnly ? viewOnlyLine(phone) : undefined;
}

function AddOnCommandLine({ line }: { readonly line: string | undefined }) {
  if (line === undefined) return null;
  return (
    <div className="flex flex-col gap-2">
      <ViewOnlyLine>{line}</ViewOnlyLine>
      <CommandBox command={ADD_COMMAND} />
    </div>
  );
}

/**
 * The Plugins list (design section 3, checklist 2), shown in Settings → Plugins: the sentence, **Add plugin**, then the
 * plugins "Installed on this computer" and the ones "Built in". A row has a letter avatar, the
 * name, the description and what it adds, and on the right its chips, version and trust date. The
 * chips are neutral unless broken: "Not trusted yet" and "Changed since you trusted it" with the
 * dashed ring, "2 errors" in `danger` for a plugin that can't load, and "Off on this computer" in
 * `warning` for one that's trusted but waits for the yes to run without the sandbox (R13). The ⋮ has Open, Open in new
 * tab, Open folder, Remove trust and **Remove plugin…**; a built-in plugin has only Open.
 *
 * @example
 * <PluginsList load={{ kind: "ready" }} plugins={plugins} builtIn={[{ id: "gmail", name: "Gmail" }]}
 *   actions={actions} onOpen={openPage} onOpenInNewTab={openPageInTab}
 *   onOpenBuiltIn={openConnectors} onAdd={openAddDialog} onRetry={reload} />
 */
export function PluginsList({
  load,
  plugins,
  builtIn,
  actions,
  onOpen,
  onOpenInNewTab,
  onOpenBuiltIn,
  onAdd,
  onRetry,
  place = "app",
  host,
  headingLevel = 2,
  now = () => new Date(),
}: PluginsListProps) {
  const { phone, viewOnly } = pluginsViewOnly(place, host);
  const [menu, setMenu] = useState<
    { readonly id: string; readonly target: ContextMenuTarget } | undefined
  >(undefined);
  const [removing, setRemoving] = useState<InstalledPlugin | undefined>(undefined);
  const { run, toastRemoved } = usePageActions();
  const installed = plugins.find((plugin) => plugin.plugin === menu?.id);
  const builtInMenu = builtIn.find((plugin) => `${BUILT_IN_PREFIX}${plugin.id}` === menu?.id);

  const entries =
    installed === undefined
      ? builtInEntries(builtInMenu?.id, onOpenBuiltIn)
      : installedMenu(installed, viewOnly, {
          open: () => onOpen(installed.plugin),
          openInNewTab: () => onOpenInNewTab(installed.plugin),
          openFolder: () => void run("openFolder", () => actions.openFolder(installed.plugin)),
          revoke: () => void run("revoke", () => actions.revoke(installed.plugin)),
          remove: () => setRemoving(installed),
        });

  const openMore = (id: string) => (event: { readonly currentTarget: HTMLElement }) =>
    setMenu({ id, target: { element: event.currentTarget } });
  const offHere = useOffHere(actions.unfencedRuns, plugins);
  const installedRows = plugins.map((plugin) =>
    installedRow(plugin, now(), openMore(plugin.plugin), offHere),
  );
  const builtInRows = builtInRowsOf(builtIn, onOpenBuiltIn !== undefined, openMore);
  const add = viewOnly ? undefined : onAdd;
  // With nothing installed the empty state's own action is the one **Add plugin**.
  const emptyInstalled = load.kind === "ready" && plugins.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {add === undefined || emptyInstalled ? null : (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={add}>
            {ADD_PLUGIN}
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {load.kind === "failed" ? (
          <EmptyState
            tone="error"
            align="start"
            headingLevel={headingLevel}
            title={LOAD_FAILED_TITLE}
            description={load.reason}
            action={{ label: TRY_AGAIN, onClick: onRetry, busy: load.trying === true }}
          />
        ) : (
          <InstalledList
            load={load}
            headingLevel={headingLevel}
            rows={installedRows}
            onAdd={add}
            onOpen={onOpen}
            onOpenInNewTab={onOpenInNewTab}
            onRetry={onRetry}
          />
        )}
        {builtInRows.length === 0 || load.kind === "loading" ? null : (
          <List
            label={BUILT_IN_HEADING}
            groups={[{ id: "built-in", heading: { name: BUILT_IN_HEADING }, rows: builtInRows }]}
            groupHeadingLevel={headingLevel}
            {...builtInOpener(onOpenBuiltIn)}
          />
        )}
      </div>
      <AddOnCommandLine line={commandLine(viewOnly, phone)} />
      <ContextMenu
        label={installed?.name ?? builtInMenu?.name ?? PLUGINS}
        entries={entries}
        target={menu?.target}
        onClose={() => setMenu(undefined)}
      />
      {removing === undefined ? null : (
        <RemovePluginDialog
          plugin={removing}
          remove={actions.remove}
          usedBy={actions.usedBy}
          onRemoved={() => {
            setRemoving(undefined);
            toastRemoved(removing.name);
          }}
          onCancel={() => setRemoving(undefined)}
        />
      )}
    </div>
  );
}

interface InstalledListProps {
  readonly load: PluginsLoad;
  readonly headingLevel: 2 | 4;
  readonly rows: ListRow[];
  readonly onAdd: (() => void) | undefined;
  readonly onOpen: (plugin: string) => void;
  readonly onOpenInNewTab: (plugin: string) => void;
  readonly onRetry: () => void;
}

/**
 * The "Installed on this computer" list. With rows it is its own box with its ListHeading above
 * it, as Home draws its sections; while loading or with none, the heading stays the List's own.
 */
function InstalledList({
  load,
  headingLevel,
  rows,
  onAdd,
  onOpen,
  onOpenInNewTab,
  onRetry,
}: InstalledListProps) {
  if (rows.length > 0 && load.kind === "ready") {
    return (
      <List
        label={INSTALLED_HEADING}
        groups={[{ id: "installed", heading: { name: INSTALLED_HEADING }, rows }]}
        groupHeadingLevel={headingLevel}
        onOpen={onOpen}
        onOpenInNewTab={onOpenInNewTab}
      />
    );
  }
  return (
    <List
      heading={{ name: INSTALLED_HEADING }}
      headingLevel={headingLevel}
      rows={rows}
      loading={load.kind === "loading"}
      loadingLabel={LOADING_LABEL}
      onOpen={onOpen}
      onOpenInNewTab={onOpenInNewTab}
      onRetry={onRetry}
      empty={{
        headingLevel: headingLevel === 2 ? 3 : 5,
        title: EMPTY_TITLE,
        description: EMPTY_LINE,
        ...(onAdd === undefined ? {} : { action: { label: ADD_PLUGIN, onClick: onAdd } }),
      }}
    />
  );
}

/** A plugin as a row: its chips and, on the right, its version and when it was trusted. */
function installedRow(
  plugin: InstalledPlugin,
  now: Date,
  onMore: (event: { readonly currentTarget: HTMLElement }) => void,
  offHere: boolean,
): ListRow {
  const trusted = trustedDay(plugin.trustedAt, now);
  const meta = rowMeta(plugin.manifest);
  const base: ListRow = {
    id: plugin.plugin,
    title: plugin.name,
    avatar: <LetterTile name={plugin.name} />,
    ...(meta === undefined ? {} : { meta }),
    more: { label: moreFor(plugin.name), onClick: onMore },
  };
  if (plugin.status === "cant-load") {
    const first = plugin.problems[0]?.message ?? "";
    return {
      ...base,
      error: { reason: first, chip: errorsChip(Math.max(plugin.problems.length, 1)) },
    };
  }
  const chip = offHere && asksAboutYes(plugin) ? offHereChip() : chipFor(plugin.status);
  const version = plugin.manifest?.version;
  const detail = [version, trusted === undefined ? undefined : `trusted ${trusted}`]
    .filter((part) => part !== undefined)
    .join(" · ");
  return {
    ...base,
    trailing: (
      <span className="flex items-center gap-2">
        {chip}
        {detail === "" ? null : <span className="text-small text-fg-muted">{detail}</span>}
      </span>
    ),
  };
}

/** The chip of a plugin that isn't on, or none. */
function chipFor(status: InstalledPlugin["status"]): ReactNode {
  if (status === "not-trusted") return <Dashed>{NOT_TRUSTED_CHIP}</Dashed>;
  if (status === "changed") return <Dashed>{CHANGED_CHIP}</Dashed>;
  return null;
}

/** R13 on a row: the plugin is trusted, but off until the yes to run without the sandbox. */
function offHereChip(): ReactNode {
  return <StatusChip tone="warning">{OFF_HERE_CHIP}</StatusChip>;
}

/** A neutral chip with the dashed ring: "not decided yet". */
function Dashed({ children }: { readonly children: string }) {
  return (
    <StatusChip tone="outline">
      <span aria-hidden="true" className="mr-1 inline-grid size-3 align-middle *:size-full">
        <DashedRingIcon />
      </span>
      {children}
    </StatusChip>
  );
}

/** What the ⋮ does for an installed plugin. */
interface RowActions {
  readonly open: () => void;
  readonly openInNewTab: () => void;
  readonly openFolder: () => void;
  readonly revoke: () => void;
  readonly remove: () => void;
}

/** The ⋮'s items: Remove trust only while there's trust to remove. */
function installedEntries(plugin: InstalledPlugin, act: RowActions): MenuEntry[] {
  const trusted = plugin.status === "on" || plugin.status === "changed";
  return [
    { id: "open", label: OPEN, onSelect: act.open },
    { id: "tab", label: OPEN_IN_NEW_TAB, onSelect: act.openInNewTab },
    { id: "folder", label: OPEN_FOLDER, onSelect: act.openFolder },
    ...(trusted ? [{ id: "revoke", label: REMOVE_TRUST, onSelect: act.revoke }] : []),
    "divider",
    { id: "remove", label: REMOVE_PLUGIN_ELLIPSIS, danger: true, onSelect: act.remove },
  ];
}
