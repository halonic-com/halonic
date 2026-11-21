import {
  declaredSignInTrustFacts,
  pluginProgramSecretText,
  signInTokenHostDiffers,
  signInTokenHostWarning,
  signInTrustLine,
} from "@halonicjs/app";
import { type Plugin, placedSecrets } from "@halonicjs/format";
import type { PluginToolRisk } from "../page/plugin-pages.ts";
import { clientSecretHosts, clientSecretNames } from "../sign-in/client-secret-hosts.ts";
import {
  ADDRESS_CLASS_WORDS,
  hostWords,
  type SecretKind,
  secretHow,
  settingAddressRow,
  type TrustCounts,
} from "./trust-text.ts";

/** A tool for agents, as Tools for agents lists it. */
export interface TrustTool {
  readonly name: string;
  readonly description: string;
  readonly risk: PluginToolRisk;
  /** The plugin marks its answers as untrusted: "its answers aren't trusted as instructions". */
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
  /** How many tools for agents it offers, which stay off with it (R11, R11b). */
  readonly tools: number;
}

/** A secret the plugin declares, as Secrets lists it. Never a value. */
export interface TrustSecret {
  readonly name: string;
  /** Where it may go, in words. */
  readonly goesTo: readonly string[];
  /**
   * A program's secret: which program gets it, as which variable, and where
   * that program may connect, in the CLI's words (HAL-12638). A backend's has none.
   */
  readonly givenTo: string | undefined;
  /** How it goes in a request; a program's secret has none. */
  readonly how: string | undefined;
  /** Whose request carries it, which decides what the dialog says about who sees its value. */
  readonly kind: SecretKind;
}

/**
 * A sign-in the backend declares, as Sign-ins lists it: the words the plugin
 * page shows before **Sign in** (HAL-8619), with a host a setting holds named
 * by that setting, since a plugin is trusted before its settings are set.
 */
export interface TrustSignIn {
  readonly name: string;
  /** What it is for, in the plugin's words. Plain text. */
  readonly purpose: string;
  /** The trust check line. */
  readonly line: string;
  /** The token host warning, when the sign-in page and the token address are different services. */
  readonly warning: string | undefined;
}

/** One address the plugin may reach. */
export interface TrustAddress {
  /** The host, or for a host from a setting R9's "The address you enter in …" row. */
  readonly address: string;
  /** Only a program reaches it: "(the program)". */
  readonly program: boolean;
  /** For a host from a setting: where it may be, as the sheet declares it (R9). */
  readonly where?: string | undefined;
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
  readonly signIns: readonly TrustSignIn[];
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
    ...placedSecrets(plugin.backend?.secrets ?? {}).map(([name, secret]) => ({
      name,
      goesTo: unique(secret.hosts.map((host) => hostWords(host, labelOf))),
      how: secretHow(secret),
      givenTo: undefined,
      kind: "backend" as const,
    })),
    ...clientSecretNames(plugin).map((name) => ({
      name,
      goesTo: unique(clientSecretHosts(plugin, name).map((host) => hostWords(host, labelOf))),
      how: undefined,
      givenTo: undefined,
      kind: "backend" as const,
    })),
    ...localTools.flatMap((local) =>
      Object.entries(local.secrets).map(([name, secret]) => ({
        name,
        goesTo: unique(secret.hosts.map((host) => hostWords(host, labelOf))),
        how: undefined,
        givenTo: sentence(pluginProgramSecretText(local, name)),
        kind: "program" as const,
      })),
    ),
  ];
  const signIns = Object.entries(plugin.backend?.signIns ?? {}).map(([name, signIn]) => {
    const facts = declaredSignInTrustFacts(signIn, (host) => hostWords(host, labelOf));
    return {
      name,
      purpose: signIn.purpose,
      line: signInTrustLine(plugin.name, facts),
      warning: signInTokenHostDiffers(facts) ? signInTokenHostWarning(facts) : undefined,
    };
  });
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
    signIns,
    addresses,
    inStudio,
    counts: {
      tools: tools.length,
      writes: tools.filter((tool) => tool.risk === "write").length,
      sends: tools.filter((tool) => tool.risk === "send").length,
      programs: programs.length,
      secrets: secrets.length,
      secretsTo: allGoTo.length === 1 ? allGoTo[0] : undefined,
      signIns: signIns.length,
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
    tools: local.tools.length,
  };
}

/**
 * The backend's hosts, then each program's that the backend doesn't already reach. A host from a
 * setting is its own row, with the class the sheet declares, so "only the addresses above" stays
 * true before the setting is filled in (R9; programs can't name one).
 */
function addressesOf(
  plugin: Plugin,
  labelOf: (setting: string) => string | undefined,
): TrustAddress[] {
  const backend = new Map<string, TrustAddress>();
  for (const host of plugin.backend?.hosts ?? []) {
    const address =
      typeof host === "string"
        ? { address: host, program: false }
        : {
            address: settingAddressRow(plugin.name, labelOf(host.fromSetting) ?? host.fromSetting),
            program: false,
            where: ADDRESS_CLASS_WORDS[host.class],
          };
    if (!backend.has(address.address)) backend.set(address.address, address);
  }
  const programs = unique((plugin.localTools ?? []).flatMap((local) => local.network)).filter(
    (address) => !backend.has(address),
  );
  return [...backend.values(), ...programs.map((address) => ({ address, program: true }))];
}

/** Core's text starts lowercase, after a name in the CLI's row; here it stands on its own line. */
function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}
