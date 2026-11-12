import type { Plugin } from "@halonicjs/format";
import type { PluginToolRisk } from "../page/plugin-pages.ts";
import { hostWords, secretHow, type TrustCounts } from "./trust-text.ts";

/** A tool for agents, as Tools for agents lists it. */
export interface TrustTool {
  readonly name: string;
  readonly description: string;
  readonly risk: PluginToolRisk;
  /** The plugin marks its answers as untrusted: "its answers are treated as outside text". */
  readonly untrusted: boolean;
}

/** A program the plugin starts on this computer, as Programs lists it. */
export interface TrustProgram {
  readonly id: string;
  /** The full command, as one line: "npx weather-mcp@1.2.3 --units metric". */
  readonly command: string;
  /** The pinned version of a package; a script in the plugin folder has none. */
  readonly version: string | undefined;
  readonly canReach: readonly string[];
}

/** A secret the plugin declares, as Secrets lists it. Never a value. */
export interface TrustSecret {
  readonly name: string;
  /** Where it may go, in words. */
  readonly goesTo: readonly string[];
  /** How it goes in a request; a program's secret has none. */
  readonly how: string | undefined;
}

/** One address the plugin may reach. */
export interface TrustAddress {
  readonly address: string;
  /** Only a program reaches it: "(the program)". */
  readonly program: boolean;
}

/** What In Studio lists: what Halonic draws for the plugin, each title with where it shows. */
export interface TrustInStudio {
  readonly settings: boolean;
  readonly commands: readonly string[];
  readonly cards: readonly string[];
  readonly panel: string | undefined;
}

/** Everything the trust check shows about a plugin, in the order it shows it. */
export interface TrustCheckContent {
  readonly tools: readonly TrustTool[];
  readonly programs: readonly TrustProgram[];
  readonly secrets: readonly TrustSecret[];
  readonly addresses: readonly TrustAddress[];
  readonly inStudio: TrustInStudio;
  readonly counts: TrustCounts;
}

/**
 * What the trust check shows for `plugin`, read from its manifest as core checked it: the same
 * tools, programs, secrets and addresses its trust fingerprint covers (core's
 * `pluginTrustContent`), with the descriptions and labels the person reads.
 *
 * @example
 * const content = trustCheckContent(weather.manifest);
 * content.counts.tools; // 1
 */
export function trustCheckContent(plugin: Plugin): TrustCheckContent {
  const localTools = plugin.localTools ?? [];
  const labelOf = (setting: string) => plugin.ui?.settings[setting]?.label;
  const tools: TrustTool[] = [
    ...(plugin.backend?.tools ?? []),
    ...localTools.flatMap((local) => local.tools),
  ].map(({ name, description, risk, untrusted }) => ({ name, description, risk, untrusted }));
  const programs = localTools.map(programOf);
  const secrets: TrustSecret[] = [
    ...Object.entries(plugin.backend?.secrets ?? {}).map(([name, secret]) => ({
      name,
      goesTo: unique(secret.hosts.map((host) => hostWords(host, labelOf))),
      how: secretHow(secret),
    })),
    ...localTools.flatMap((local) =>
      Object.entries(local.secrets).map(([name, secret]) => ({
        name,
        goesTo: unique(secret.hosts.map((host) => hostWords(host, labelOf))),
        how: undefined,
      })),
    ),
  ];
  const addresses = addressesOf(plugin, labelOf);
  const ui = plugin.ui;
  const inStudio: TrustInStudio = {
    settings: Object.keys(ui?.settings ?? {}).length > 0,
    commands: (ui?.commands ?? []).map((command) => command.title),
    cards: (ui?.cards ?? []).map((card) => card.title),
    panel: ui?.panel?.title,
  };
  const allGoTo = unique(secrets.flatMap((secret) => secret.goesTo));
  return {
    tools,
    programs,
    secrets,
    addresses,
    inStudio,
    counts: {
      tools: tools.length,
      writes: tools.filter((tool) => tool.risk === "write").length,
      sends: tools.filter((tool) => tool.risk === "send").length,
      programs: programs.length,
      secrets: secrets.length,
      secretsTo: allGoTo.length === 1 ? allGoTo[0] : undefined,
      addresses: addresses.length,
    },
  };
}

type LocalTool = NonNullable<Plugin["localTools"]>[number];

function programOf(local: LocalTool): TrustProgram {
  const { package: pinned, script } = local.start;
  let start = "";
  if (pinned !== undefined) {
    start =
      pinned.runner === "npx"
        ? `npx ${pinned.name}@${pinned.version}`
        : `uvx ${pinned.name}==${pinned.version}`;
  } else if (script !== undefined) {
    start = `${script.program} ${script.path}`;
  }
  return {
    id: local.id,
    command: [start, ...local.args].join(" "),
    version: pinned?.version,
    canReach: local.network,
  };
}

/** The backend's hosts, then each program's that the backend doesn't already reach. */
function addressesOf(
  plugin: Plugin,
  labelOf: (setting: string) => string | undefined,
): TrustAddress[] {
  const backend = unique((plugin.backend?.hosts ?? []).map((host) => hostWords(host, labelOf)));
  const programs = unique((plugin.localTools ?? []).flatMap((local) => local.network)).filter(
    (address) => !backend.includes(address),
  );
  return [
    ...backend.map((address) => ({ address, program: false })),
    ...programs.map((address) => ({ address, program: true })),
  ];
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}
