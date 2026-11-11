import { Button, DashedRingIcon, usePresentation, WarningIcon } from "@halonicjs/studio-kit";
import { useId } from "react";
import { PluginCard, type PluginCardStatus, type PluginCardUi } from "../cards/plugin-card.tsx";
import { fromPlugin } from "../commands/command-text.ts";
import type { PluginCommand, PluginToolCaller } from "../commands/plugin-command-dialog.tsx";
import {
  CHANGED_LINE,
  cantLoadPluginLine,
  closingLine,
  NOT_TRUSTED_LINE,
  PLUGIN_PANEL,
} from "./panel-text.ts";

/** The props of `PluginPanel`. */
export interface PluginPanelProps {
  /** The plugin's id and its name, which is untrusted text. */
  readonly plugin: { readonly id: string; readonly name: string };
  readonly status: PluginCardStatus;
  /** The panel's title, from the plugin's `ui.panel`. */
  readonly title: string;
  readonly commands: readonly PluginCommand[];
  readonly cards: readonly PluginCardUi[];
  /** Calls a plugin's tools for its cards; wrap it in `timedToolCaller`. */
  readonly caller: PluginToolCaller;
  /** A command's button: opens the command's dialog, the same as in Ctrl K. */
  readonly onCommand: (command: PluginCommand) => void;
  /** Review, on a card whose plugin isn't trusted: opens the plugin's trust check. */
  readonly onReview: () => void;
  /** Details, on a card whose plugin can't load: opens the plugin's page. */
  readonly onDetails: () => void;
}

/**
 * A plugin's panel, the page of its tab (design 8.3, UX checklist 9, T16-F24): **PLUGIN PANEL**
 * over the panel's title as the `h1`, "From the *name* plugin" at the right, the plugin's commands
 * as `secondary` buttons, its cards two to a row (one on a phone), and the closing line. A panel
 * holds only those; every word and button is Halonic's apart from the plugin's titles.
 *
 * While the plugin is off (G7, T16-F44) the cards show their states and the command buttons are
 * unavailable, with the plugin page's status line above them as the reason.
 *
 * @example
 * <PluginPanel plugin={{ id: "weather", name: "Weather" }} status="on" title="Weather"
 *   commands={ui.commands} cards={ui.cards} caller={caller}
 *   onCommand={(command) => opener.open(plugin, command)} onReview={review} onDetails={details} />
 */
export function PluginPanel(props: PluginPanelProps) {
  const { plugin, status, title, commands, cards } = props;
  const phone = usePresentation() === "phone";
  const reasonId = useId();
  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-caption uppercase tracking-label text-fg-subtle">{PLUGIN_PANEL}</p>
          <h1 tabIndex={-1} className="text-title outline-none wrap-anywhere">
            {title}
          </h1>
        </div>
        <p className="shrink-0 text-caption text-fg-subtle">{fromPlugin(plugin.name)}</p>
      </header>
      {status === "on" ? null : <OffLine id={reasonId} name={plugin.name} status={status} />}
      {commands.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {commands.map((command) => (
            <Button
              key={command.id}
              variant="secondary"
              unavailable={status === "on" ? undefined : { reason: reasonId }}
              onClick={() => props.onCommand(command)}
            >
              {command.title}
            </Button>
          ))}
        </div>
      )}
      {cards.length === 0 ? null : (
        <div className={phone ? "grid gap-2" : "grid grid-cols-2 gap-2"}>
          {cards.map((card) => (
            <PluginCard
              key={card.id}
              plugin={plugin}
              status={status}
              card={card}
              caller={props.caller}
              onReview={props.onReview}
              onDetails={props.onDetails}
            />
          ))}
        </div>
      )}
      <p className="text-small text-fg-muted wrap-anywhere">{closingLine(plugin.name)}</p>
    </div>
  );
}

/** Why the plugin is off: the plugin page's status line, which the command buttons point at. */
function OffLine({
  id,
  name,
  status,
}: {
  readonly id: string;
  readonly name: string;
  readonly status: Exclude<PluginCardStatus, "on">;
}) {
  return (
    <p className="flex gap-2 text-small text-fg-muted wrap-anywhere">
      <span aria-hidden="true" className="mt-0.5 inline-grid size-icon-sm shrink-0 *:size-full">
        {status === "cant-load" ? <WarningIcon /> : <DashedRingIcon />}
      </span>
      <span id={id}>{offLine(name, status)}</span>
    </p>
  );
}

function offLine(name: string, status: Exclude<PluginCardStatus, "on">): string {
  if (status === "changed") return CHANGED_LINE;
  if (status === "cant-load") return cantLoadPluginLine(name);
  return NOT_TRUSTED_LINE;
}
