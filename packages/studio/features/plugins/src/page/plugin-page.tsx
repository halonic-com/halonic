import { Button, Callout, DashedRingIcon } from "@halonicjs/studio-kit";
import { saveNoteWords } from "@halonicjs/studio-shell";
import { useId, useState } from "react";
import type { PluginCardStatus } from "../cards/plugin-card.tsx";
import { CHANGED_LINE, NOT_TRUSTED_LINE } from "../panel/panel-text.ts";
import {
  type PluginSecretStore,
  type PluginSettingsReader,
  PluginSettingsSection,
  type SettingsSaveState,
} from "../settings/plugin-settings-section.tsx";
import {
  CANT_LOAD_LINE,
  cantLoadTitle,
  changedSince,
  NOT_TRUSTED_YET,
  ON,
  OPEN_PANEL,
  onLine,
  PLUGIN,
  quoted,
  trustedDay,
} from "./page-text.ts";
import type { InstalledPlugin, PluginLoadProblem } from "./plugin-pages.ts";
import { WhatItAdds } from "./what-it-adds.tsx";

/** The props of `PluginPage`. */
export interface PluginPageProps {
  readonly plugin: InstalledPlugin;
  readonly settings: PluginSettingsReader;
  readonly secrets: PluginSecretStore;
  /** **Open panel**: opens the plugin's panel in its tab. */
  readonly onOpenPanel: () => void;
  /** Today, for the trust date's year. */
  readonly now?: () => Date;
}

/**
 * A plugin's page, the page of its tab (design section 7, UX checklist 6, T16-F13 to F16):
 * **PLUGIN** and the plugin's name as the `h1` (not a rename field: the name is the
 * plugin's), **Open panel** when it has a panel; its description in quotes, one status box, its
 * Settings and What it adds. Every word that acts is Halonic's; the plugin's text is plain text.
 *
 * While the plugin is off (not trusted yet, changed, can't load), Settings and What it adds stay
 * readable at full contrast and the fields use the kit's unavailable state, with the status box as
 * the reason. A plugin that can't load shows its problems, path in mono, then the message.
 *
 * @example
 * <PluginPage plugin={weather} settings={pluginService} secrets={keychain}
 *   onOpenPanel={() => openPanel("weather")} />
 */
export function PluginPage({
  plugin,
  settings,
  secrets,
  onOpenPanel,
  now = () => new Date(),
}: PluginPageProps) {
  const statusId = useId();
  const [saveState, setSaveState] = useState<SettingsSaveState | undefined>(undefined);
  const manifest = plugin.manifest;
  const off = plugin.status === "on" ? undefined : { reason: statusId };
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-(--layer-sticky) flex min-h-13 items-center gap-4 border-b border-border bg-surface px-4">
        <h1 tabIndex={-1} className="flex min-w-0 flex-1 items-center gap-1.5 outline-none">
          <span className="shrink-0 text-caption uppercase tracking-label text-fg-subtle">
            {PLUGIN}
          </span>
          <span className="truncate text-body-strong" title={plugin.name}>
            {plugin.name}
          </span>
        </h1>
        <SaveNote state={saveState} />
        {plugin.panel === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={onOpenPanel}>
            {OPEN_PANEL}
          </Button>
        )}
      </header>
      <div className="flex max-w-3xl flex-col gap-6 p-4">
        {manifest === undefined || manifest.description === "" ? null : (
          <p className="text-body text-fg-muted wrap-anywhere">{quoted(manifest.description)}</p>
        )}
        <StatusBox id={statusId} plugin={plugin} now={now} />
        {manifest === undefined ? null : (
          <>
            <PluginSettingsSection
              plugin={manifest}
              host={settings}
              secrets={secrets}
              off={off}
              onSaveState={setSaveState}
            />
            <WhatItAdds manifest={manifest} />
          </>
        )}
      </div>
    </div>
  );
}

/** "Saving…", then "Saved" with its check; a failure shows under its field instead. */
function SaveNote({ state }: { readonly state: SettingsSaveState | undefined }) {
  if (state === undefined || state === "failed") return null;
  const words = saveNoteWords({ kind: state });
  return (
    <p role="status" className="shrink-0 text-small text-fg-muted">
      {words.mark === "check" ? <span aria-hidden="true">✓ </span> : null}
      {words.name === undefined ? (
        words.text
      ) : (
        <>
          <span aria-hidden="true">{words.text}</span>
          <span className="sr-only">{words.name}</span>
        </>
      )}
    </p>
  );
}

/** The one status box (T12): on, not trusted yet, changed, or the can't-load Callout. */
function StatusBox({
  id,
  plugin,
  now,
}: {
  readonly id: string;
  readonly plugin: InstalledPlugin;
  readonly now: () => Date;
}) {
  if (plugin.status === "cant-load") {
    return (
      <div id={id}>
        <Callout tone="danger" title={cantLoadTitle(plugin.name)}>
          <p>{CANT_LOAD_LINE}</p>
          <Problems problems={plugin.problems} />
        </Callout>
      </div>
    );
  }
  const trusted = trustedDay(plugin.trustedAt, now());
  const box = statusWords(plugin.status, plugin, trusted);
  return (
    <div id={id} className="flex gap-2 rounded-md bg-surface-subtle p-3">
      <span
        aria-hidden="true"
        className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full"
      >
        {plugin.status === "on" ? "✓" : <DashedRingIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-strong">{box.title}</p>
        {box.line === "" ? null : (
          <p className="text-small text-fg-muted wrap-anywhere">{box.line}</p>
        )}
      </div>
    </div>
  );
}

function statusWords(
  status: Exclude<PluginCardStatus, "cant-load">,
  plugin: InstalledPlugin,
  trusted: string | undefined,
): { readonly title: string; readonly line: string } {
  switch (status) {
    case "on":
      return {
        title: ON,
        line:
          plugin.manifest === undefined
            ? ""
            : onLine(trusted, plugin.manifest.version, plugin.origin),
      };
    case "changed":
      return { title: changedSince(trusted), line: CHANGED_LINE };
    case "not-trusted":
      return { title: NOT_TRUSTED_YET, line: NOT_TRUSTED_LINE };
  }
}

/** Each problem: where, in mono, then the loader's message, as plain text. */
function Problems({ problems }: { readonly problems: readonly PluginLoadProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="mt-2 flex list-none flex-col gap-1">
      {problems.map((problem, index) => (
        // The loader can give two problems at the same place, so the index keeps keys apart.
        <li key={index} className="wrap-anywhere">
          {problemPlace(problem) === "" ? null : (
            <span className="font-mono">{problemPlace(problem)}</span>
          )}
          {problemPlace(problem) === "" ? null : " "}
          <span>{problem.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** "plugin.yaml ui.commands.0.tool", or just the file, or `""` for the folder itself. */
function problemPlace(problem: PluginLoadProblem): string {
  return [problem.file, problem.path.map(String).join(".")].filter((part) => part !== "").join(" ");
}
