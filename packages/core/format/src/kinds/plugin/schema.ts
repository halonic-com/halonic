// `plugin.yaml`: a plugin's manifest (ADR 2026-11-09-plugins, section 1).
// Like the integration sheet it imports only schema-kit, std and the format's
// own field rules, so the integration kit and the conformance suite can read
// it without the YAML reader.
import { type Infer, s } from "@halonicjs/schema-kit";
import { asciiHost } from "@halonicjs/std";
import { relativePathProblem } from "../../shared/relative-path.ts";
import { allowedSiteProblem, MAX_ALLOWED_SITES } from "../agent/sandbox-fields.ts";
import {
  INTEGRATION_NAME_PATTERN,
  IntegrationSheet,
  IntegrationTool,
  MAX_TIMEOUT_MS,
  secretFields,
} from "../integration/schema.ts";

const name = s
  .string()
  .regex(INTEGRATION_NAME_PATTERN, "use lower-case words joined by '-', such as 'weather-key'");

/**
 * A tool argument's name, as the tool's own schema writes it, such as
 * `city` or `folderId`.
 */
export const ARGUMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const argumentName = s
  .string()
  .regex(ARGUMENT_NAME_PATTERN, "use the tool argument's name, such as 'city' or 'folderId'");

/** Text a person reads: a title or a label. Studio shows it as untrusted text. */
const label = s.string().min(1).max(80);

/**
 * Why a local tool's `network` entry can't be used, or `null` when it can.
 * The list is the sandbox's allow-list for code Halonic doesn't trust, so it
 * takes the agent file's `allowedSites` rules: no address, port, `localhost`
 * or local-network name. It must also be written as the sandbox stores it,
 * lowercase and in Punycode, so a secret's host matches it exactly.
 *
 * @param site - a `network` entry
 * @returns a message, or `null`
 */
export function networkSiteProblem(site: string): string | null {
  const problem = allowedSiteProblem(site);
  if (problem !== null) return problem;
  const stored = asciiHost(site);
  return stored === site ? null : `Write the host name as '${stored}'`;
}

const networkSite = s.string().superRefine((site, context) => {
  const problem = networkSiteProblem(site);
  if (problem !== null) context.addIssue({ code: "custom", message: problem });
});

/**
 * Why a path to a file in the plugin folder can't be used, or `null` when it
 * can: the same rules as an agent's working folder, so it can't point outside
 * the plugin or be read as another name on Windows or macOS.
 *
 * @param path - a path such as `backend/index.js`
 * @returns a message, or `null`
 */
export function pluginPathProblem(path: string): string | null {
  return relativePathProblem(path, { root: "the plugin folder", part: "file or folder name" });
}

const pluginPath = s.string().superRefine((path, context) => {
  const problem = pluginPathProblem(path);
  if (problem !== null) context.addIssue({ code: "custom", message: problem });
});

/** Where a backend's built code is when `entry` doesn't say. */
export const DEFAULT_BACKEND_ENTRY = "backend/index.js";

/**
 * The code-free part of an integration sheet: every field of
 * `IntegrationSheet` except `id`, `version` and `kit`, which the plugin's own
 * `id`, `version` and `sdk` give. It is the sheet's schema, not a copy, with
 * `entry` added and `provides` defaulted.
 */
const Backend = IntegrationSheet.omit({ id: true, version: true, kit: true })
  .extend({
    /** The built JavaScript module in the plugin folder that exports the `Integration`. */
    entry: pluginPath.default(DEFAULT_BACKEND_ENTRY),
    provides: IntegrationSheet.shape.provides.default(["connector"]),
  })
  .strict();

/** An exact npm version, `major.minor.patch` with an optional pre-release: never a range or tag. */
export const NPM_EXACT_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** An exact PEP 440 version, such as `0.4.1` or `2.0rc1`: never `==`, a range or a wildcard. */
export const PYPI_EXACT_VERSION_PATTERN =
  /^(?:\d+!)?\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?$/;

/** An npm package name, scoped or not. It can't start with `-`, so it is never read as an option. */
const npmPackage = s
  .string()
  .regex(
    /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/,
    "use an npm package name, such as 'weather-mcp' or '@example/weather-mcp'",
  );

/** A Python package name. It can't start with `-`, so it is never read as an option. */
const pypiPackage = s
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/,
    "use a Python package name, such as 'weather-radar'",
  );

/**
 * A package registry's base address, such as `https://registry.npmjs.org` or
 * `https://pypi.example.com`; without one the runner's public registry is
 * used. It becomes the pin's `registryUrl`, so it is the base, not an index
 * inside it: the launcher adds `/simple` for PyPI and the pin check reads
 * `/pypi/<name>/<version>/json`. A trailing `/` is fine; both drop it.
 */
const registry = s.url().regex(/^https:\/\//, "use an https address for the registry");

/**
 * A PyPI index ends in `/simple`, and that is the address a mirror's docs
 * give, so it is the likely mistake. It is refused rather than trimmed: the
 * pin in the trust record is then the address the author wrote, and an
 * index that isn't under `<base>/simple` is never guessed at.
 */
const pypiRegistry = registry.regex(
  /^(?!https:\/\/[^/]+\/(?:.*\/)?simple\/*$)/,
  "use the registry's base address, without '/simple': the launcher adds it",
);

/** A pinned package, started by its runner. The pin goes into the trust record. */
const PackageStart = s.discriminatedUnion("runner", [
  s
    .object({
      runner: s.literal("npx"),
      name: npmPackage,
      version: s
        .string()
        .regex(NPM_EXACT_VERSION_PATTERN, "use an exact version, such as '1.2.3', not a range"),
      registry: registry.optional(),
    })
    .strict(),
  s
    .object({
      runner: s.literal("uvx"),
      name: pypiPackage,
      version: s
        .string()
        .regex(PYPI_EXACT_VERSION_PATTERN, "use an exact version, such as '0.4.1', not a range"),
      registry: pypiRegistry.optional(),
    })
    .strict(),
]);

/** A file in the plugin folder, started without a shell by a program the person already has. */
const ScriptStart = s.object({ program: s.enum(["node", "python"]), path: pluginPath }).strict();

/**
 * How a local tool's program starts: exactly one of a package and a script.
 * Both are optional keys rather than a union, so a mistake inside one is
 * reported at its own field.
 */
const Start = s
  .object({ package: PackageStart.optional(), script: ScriptStart.optional() })
  .strict()
  .superRefine((start, context) => {
    if ((start.package === undefined) === (start.script === undefined)) {
      context.addIssue({
        code: "custom",
        message: "start a local tool with either package or script",
      });
    }
  });

/**
 * The longest a plugin's id may be. Halonic keeps a plugin's secrets under a
 * name made of its id and the secret's name, and a secret name is at most
 * 128 characters (ADR 2026-11-09-plugins, section 3).
 */
export const MAX_PLUGIN_ID_LENGTH = 48;

/** The longest a secret a plugin declares may be named, for the same reason. */
export const MAX_PLUGIN_SECRET_NAME_LENGTH = 64;

/** An environment variable's name, such as `ACME_ROOT`. */
export const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/** Where an environment value comes from: a setting or a declared secret, never a literal. */
const EnvValue = s.union([
  s.object({ setting: name }).strict(),
  s.object({ secret: name }).strict(),
]);

/** An MCP server over stdio that runs in a `Sandbox` session on the person's computer. */
const LocalTool = s
  .object({
    /** Unique in the plugin; the trust record keys the pin by it. */
    id: name,
    start: Start,
    args: s.array(s.string()).default([]),
    env: s
      .record(
        s.string().regex(ENV_NAME_PATTERN, "use an upper-case name, such as 'ACME_ROOT'"),
        EnvValue,
      )
      .default({}),
    /** The sheet's secret fields, without `as`: a local tool gets them as `env` values. */
    secrets: s.record(name, s.object(secretFields).strict()).default({}),
    /** The hosts the program may reach, beyond the bridge. */
    network: s.array(networkSite).max(MAX_ALLOWED_SITES).default([]),
    /** One tool call; the session's own time limit is Halonic's. */
    callTimeoutMs: s.number().int().positive().max(MAX_TIMEOUT_MS).default(60_000),
    /** Every tool it offers. A tool the server lists but this doesn't is refused. */
    tools: s.array(IntegrationTool).min(1),
  })
  .strict();

/** What every field says, whatever its type. */
const fieldBase = {
  label,
  help: s.string().min(1).max(500).optional(),
  required: s.boolean().default(false),
};

/** The field types a setting and a command's form share. */
const inputFields = [
  s.object({ ...fieldBase, type: s.literal("text"), default: s.string().optional() }).strict(),
  s.object({ ...fieldBase, type: s.literal("url"), default: s.url().optional() }).strict(),
  s.object({ ...fieldBase, type: s.literal("number"), default: s.number().optional() }).strict(),
  s.object({ ...fieldBase, type: s.literal("boolean"), default: s.boolean().optional() }).strict(),
  s
    .object({
      ...fieldBase,
      type: s.literal("choice"),
      choices: s.array(s.string().min(1)).min(1),
      default: s.string().optional(),
    })
    .strict(),
] as const;

/**
 * A setting the person fills in. A `secret` one names a declared secret,
 * goes to Secrets and never has a default.
 */
const SettingField = s.discriminatedUnion("type", [
  ...inputFields,
  s.object({ ...fieldBase, type: s.literal("secret"), secret: name }).strict(),
]);

/** One field of a command's form; its name is the tool argument it fills. */
const FormField = s.discriminatedUnion("type", inputFields);

/** How a tool's answer is drawn. */
const show = s.enum(["text", "markdown", "table"]).default("text");

/** A command in the palette: an optional form, then the tool's answer in a card. */
const Command = s
  .object({
    id: name,
    title: label,
    tool: s.string().min(1),
    form: s.record(argumentName, FormField).default({}),
    show,
  })
  .strict();

/** A card on Home and in the plugin's panel, if it has one, filled by one `read` tool call with fixed arguments. */
const Card = s
  .object({
    id: name,
    title: label,
    tool: s.string().min(1),
    args: s.record(argumentName, s.union([s.string(), s.number(), s.boolean()])).default({}),
    show,
  })
  .strict();

/** The plugin's one panel, opened in its own tab: its commands, then its cards, in manifest order. */
const Panel = s.object({ title: label }).strict();

/** What Studio draws for the plugin. It is data only; no plugin code runs in Studio. */
const Ui = s
  .object({
    settings: s.record(name, SettingField).default({}),
    commands: s.array(Command).default([]),
    cards: s.array(Card).default([]),
    panel: Panel.optional(),
  })
  .strict();

/**
 * `plugin.yaml`: a plugin's id and versions and its parts: a backend (an
 * integration sheet), local tools and UI.
 */
export const Plugin = s
  .object({
    id: IntegrationSheet.shape.id,
    /** The plugin's own version. */
    version: IntegrationSheet.shape.version,
    /** The plugin SDK version it was built for: the `Integration` port's version, as `kit` is. */
    sdk: IntegrationSheet.shape.kit,
    name: label,
    /** Empty for an `integration.yaml` read as a plugin, which has no description. */
    description: s.string().max(500).default(""),
    backend: Backend.optional(),
    localTools: s.array(LocalTool).min(1).optional(),
    ui: Ui.optional(),
  })
  .strict();

/** A plugin manifest, with defaults filled in. */
export type Plugin = Infer<typeof Plugin>;

/** A plugin's backend: an integration sheet without `id`, `version` and `kit`, plus `entry`. */
export type PluginBackend = Infer<typeof Backend>;

/** One of a plugin's local tools. */
export type PluginLocalTool = Infer<typeof LocalTool>;

/** What Studio draws for a plugin. */
export type PluginUi = Infer<typeof Ui>;
