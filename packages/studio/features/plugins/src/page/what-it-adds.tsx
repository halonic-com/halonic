import type { Plugin } from "@halonicjs/format";
import { StatusChip } from "@halonicjs/studio-kit";
import { type ReactNode, useId } from "react";
import {
  ADDS_CARD,
  ADDS_CARDS,
  ADDS_COMMAND,
  ADDS_COMMANDS,
  ADDS_PANEL,
  IN_CTRL_K,
  ON_HOME,
  OPENS_IN_A_TAB,
  quoted,
  RISK_WORDS,
  TOOLS_FOR_AGENTS,
  TOOLS_LINE,
  WHAT_IT_ADDS,
} from "./page-text.ts";
import type { PluginToolRisk } from "./plugin-pages.ts";

interface AddedTool {
  readonly name: string;
  readonly description: string;
  readonly risk: PluginToolRisk;
}

/** Every tool the plugin gives agents: its backend's, then each local program's. */
function toolsOf(manifest: Plugin): AddedTool[] {
  return [
    ...(manifest.backend?.tools ?? []),
    ...(manifest.localTools ?? []).flatMap((local) => local.tools),
  ];
}

/**
 * What it adds (design section 7, checklist 6.4): Tools for agents with neutral risk chips and the
 * connector line, then its commands "· in Ctrl K", its cards "· on Home" and its panel "· opens in
 * a tab". A group only shows when it has something; a plugin that adds nothing leaves it out.
 */
export function WhatItAdds({ manifest }: { readonly manifest: Plugin }) {
  const headingId = useId();
  const tools = toolsOf(manifest);
  const commands = manifest.ui?.commands ?? [];
  const cards = manifest.ui?.cards ?? [];
  const panel = manifest.ui?.panel;
  if (tools.length === 0 && commands.length === 0 && cards.length === 0 && panel === undefined) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-heading">
        {WHAT_IT_ADDS}
      </h2>
      {tools.length === 0 ? null : (
        <Group title={TOOLS_FOR_AGENTS}>
          <ul className="flex list-none flex-col gap-2">
            {tools.map((tool) => (
              <li key={tool.name} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-small wrap-anywhere">{tool.name}</code>
                  <StatusChip tone="neutral">{RISK_WORDS[tool.risk]}</StatusChip>
                </span>
                <span className="text-small text-fg-muted wrap-anywhere">
                  {quoted(tool.description)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-small text-fg-muted">{TOOLS_LINE}</p>
        </Group>
      )}
      {commands.length === 0 ? null : (
        <Group title={commands.length === 1 ? ADDS_COMMAND : ADDS_COMMANDS}>
          <Titles titles={commands.map((command) => command.title)} where={IN_CTRL_K} />
        </Group>
      )}
      {cards.length === 0 ? null : (
        <Group title={cards.length === 1 ? ADDS_CARD : ADDS_CARDS}>
          <Titles titles={cards.map((card) => card.title)} where={ON_HOME} />
        </Group>
      )}
      {panel === undefined ? null : (
        <Group title={ADDS_PANEL}>
          <Titles titles={[panel.title]} where={OPENS_IN_A_TAB} />
        </Group>
      )}
    </section>
  );
}

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-body-strong">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The plugin's titles, each as plain text, followed by where Studio shows it. */
function Titles({ titles, where }: { readonly titles: readonly string[]; readonly where: string }) {
  return (
    <ul className="flex list-none flex-col gap-1">
      {titles.map((title, index) => (
        // Two commands may share a title; the manifest's order never changes while it shows.
        <li key={index} className="text-small wrap-anywhere">
          {title} <span className="text-fg-subtle">· {where}</span>
        </li>
      ))}
    </ul>
  );
}
