import {
  Button,
  ContextMenu,
  type ContextMenuTarget,
  DashedRingIcon,
  EmptyState,
  List,
  type ListRow,
  type MenuEntry,
  StatusChip,
} from "@halonicjs/studio-kit";
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
import {
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
  OPEN,
  OPEN_IN_NEW_TAB,
  PLUGINS,
  PLUGINS_SENTENCE,
  rowMeta,
  TRY_AGAIN,
} from "./list-text.ts";

/** A plugin that comes with Halonic, such as Gmail and Google Drive. It has no page of its own. */
export interface BuiltInPlugin {
  readonly id: string;
  readonly name: string;
}

/** Whether the installed plugins have loaded, so the list can show a skeleton or why not. */
export type PluginsLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly reason: string }
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
  /** Open on a built-in plugin. */
  readonly onOpenBuiltIn: (id: string) => void;
  /** **Add plugin**: opens the Add plugin dialog. */
  readonly onAdd: () => void;
  /** **Try again** after the list couldn't load. */
  readonly onRetry: () => void;
  readonly now?: () => Date;
}

const BUILT_IN_PREFIX = "built-in:";

/**
 * Library › Plugins (design section 3, checklist 2): the sentence, **Add plugin**, then the
 * plugins "Installed on this computer" and the ones "Built in". A row has a letter avatar, the
 * name, the description and what it adds, and on the right its chips, version and trust date. The
 * chips are neutral unless broken: "Not trusted yet" and "Changed since you trusted it" with the
 * dashed ring, "2 errors" in `danger` for a plugin that can't load. The ⋮ has Open, Open in new
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
  now = () => new Date(),
}: PluginsListProps) {
  const [menu, setMenu] = useState<
    { readonly id: string; readonly target: ContextMenuTarget } | undefined
  >(undefined);
  const [removing, setRemoving] = useState<InstalledPlugin | undefined>(undefined);
  const { run, toastRemoved } = usePageActions();
  const installed = plugins.find((plugin) => plugin.plugin === menu?.id);
  const builtInMenu = builtIn.find((plugin) => `${BUILT_IN_PREFIX}${plugin.id}` === menu?.id);

  let entries: MenuEntry[] = [];
  if (installed !== undefined) {
    entries = installedEntries(installed, {
      open: () => onOpen(installed.plugin),
      openInNewTab: () => onOpenInNewTab(installed.plugin),
      openFolder: () => void run("openFolder", () => actions.openFolder(installed.plugin)),
      revoke: () => void run("revoke", () => actions.revoke(installed.plugin)),
      remove: () => setRemoving(installed),
    });
  } else if (builtInMenu !== undefined) {
    entries = [{ id: "open", label: OPEN, onSelect: () => onOpenBuiltIn(builtInMenu.id) }];
  }

  const openMore = (id: string) => (event: { readonly currentTarget: HTMLElement }) =>
    setMenu({ id, target: { element: event.currentTarget } });
  const installedRows = plugins.map((plugin) =>
    installedRow(plugin, now(), openMore(plugin.plugin)),
  );
  const builtInRows = builtIn.map(
    (plugin): ListRow => ({
      id: `${BUILT_IN_PREFIX}${plugin.id}`,
      title: plugin.name,
      avatar: <Letter name={plugin.name} />,
      meta: COMES_WITH_HALONIC,
      trailing: <StatusChip tone="neutral">{BUILT_IN_CHIP}</StatusChip>,
      more: { label: moreFor(plugin.name), onClick: openMore(`${BUILT_IN_PREFIX}${plugin.id}`) },
    }),
  );
  const openRow = (id: string) =>
    id.startsWith(BUILT_IN_PREFIX) ? onOpenBuiltIn(id.slice(BUILT_IN_PREFIX.length)) : onOpen(id);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-start gap-4">
        <p className="min-w-0 flex-1 text-body text-fg-muted">{PLUGINS_SENTENCE}</p>
        <Button variant="primary" size="sm" onClick={onAdd}>
          {ADD_PLUGIN}
        </Button>
      </header>
      {load.kind === "failed" ? (
        <EmptyState
          tone="error"
          title={LOAD_FAILED_TITLE}
          description={load.reason}
          action={{ label: TRY_AGAIN, onClick: onRetry }}
        />
      ) : (
        <>
          <List
            heading={{ name: INSTALLED_HEADING }}
            rows={installedRows}
            loading={load.kind === "loading"}
            loadingLabel={LOADING_LABEL}
            onOpen={openRow}
            onOpenInNewTab={(id) => onOpenInNewTab(id)}
            onRetry={onRetry}
            empty={{
              title: EMPTY_TITLE,
              description: EMPTY_LINE,
              action: { label: ADD_PLUGIN, onClick: onAdd },
            }}
          />
          {builtInRows.length === 0 || load.kind === "loading" ? null : (
            <List heading={{ name: BUILT_IN_HEADING }} rows={builtInRows} onOpen={openRow} />
          )}
        </>
      )}
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

/** The accent-tinted letter that stands in for a logo: a plugin has none in v0.1. */
function Letter({ name }: { readonly name: string }) {
  return (
    <span className="grid size-full place-items-center rounded-md bg-accent-soft text-small font-semibold text-accent">
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** A plugin as a row: its chips and, on the right, its version and when it was trusted. */
function installedRow(
  plugin: InstalledPlugin,
  now: Date,
  onMore: (event: { readonly currentTarget: HTMLElement }) => void,
): ListRow {
  const trusted = trustedDay(plugin.trustedAt, now);
  const meta = rowMeta(plugin.manifest);
  const base: ListRow = {
    id: plugin.plugin,
    title: plugin.name,
    avatar: <Letter name={plugin.name} />,
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
  const chip = chipFor(plugin.status);
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
