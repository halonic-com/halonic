import {
  type IntegrationSecret,
  type IntegrationSheet,
  integrationPolicy,
  parseIntegrationSheet,
} from "@halonicjs/format/integration";
import {
  type HttpClient,
  type Integration,
  type IntegrationHost,
  type ProviderConfig,
  type SecretPlacement,
  type Secrets,
  type TokenStore,
  workspaceSecrets,
} from "@halonicjs/ports";
import { deepEqual, err, ok, type Result } from "@halonicjs/std";
import { declarationProblems } from "./declaration.ts";
import { createIntegrationHost } from "./host.ts";
import type { RequestLimits } from "./limited-http.ts";
import type { LoadProblem } from "./load-problem.ts";
import type { RequestLog } from "./request-log.ts";
import type { SecretOnWire } from "./secret-filter.ts";
import { checkSecretLength } from "./secret-placement.ts";

/** An integration and its permission sheet, as they were found. */
export interface IntegrationSource {
  /**
   * `built-in`: from the integrations release this Halonic pins. `local`: from
   * the workspace, such as one the assistant wrote; it loads only with the
   * sheet the user approved.
   */
  readonly origin: "built-in" | "local";
  /** The permission sheet as data: the JSON the build writes next to the code. */
  readonly sheet: unknown;
  readonly integration: Integration;
  /**
   * For a `local` integration: the sheet as the user approved it in the trust
   * step. The loader refuses it when the sheet has changed since.
   */
  readonly approvedSheet?: unknown;
}

/** What the workspace chose for one integration. */
export interface WorkspaceChoices {
  /** Its settings, such as the URL a `{ fromSetting }` host reads. Never a secret value. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /**
   * For each secret in the sheet, the workspace secret the user picked for
   * it. A secret left out isn't configured: an optional one is left off the
   * request, any other is refused when a request needs it.
   */
  readonly secretNames?: Readonly<Record<string, string>>;
}

/** What {@link loadIntegration} needs: the integration and the raw ports, which the integration never sees. */
export interface LoadIntegrationOptions {
  readonly source: IntegrationSource;
  readonly choices?: WorkspaceChoices;
  readonly transport: HttpClient;
  readonly secrets: Secrets;
  readonly tokens: TokenStore;
  /** What this runtime offers beyond HTTP, for the sheet's `needs`, such as `process`. Default none. */
  readonly capabilities?: readonly string[];
  readonly now?: () => number;
}

/** An integration ready to connect: its checked sheet, its host and the request log only Halonic reads. */
export interface LoadedIntegration {
  readonly origin: IntegrationSource["origin"];
  readonly integration: Integration;
  readonly sheet: IntegrationSheet;
  readonly host: IntegrationHost;
  readonly log: RequestLog;
}

/** What {@link prepareIntegration} needs: {@link LoadIntegrationOptions} without the code. */
export interface PrepareIntegrationOptions extends Omit<LoadIntegrationOptions, "source"> {
  readonly source: Omit<IntegrationSource, "integration">;
}

/**
 * An integration whose sheet and choices are checked and whose host is
 * built, but whose code hasn't been checked against the sheet yet: the code
 * runs somewhere Halonic can't read it directly, such as the runner.
 */
export interface PreparedIntegration extends Omit<LoadedIntegration, "integration"> {
  /**
   * Reads the value of each secret the user picked, with the one placement
   * the sheet allows, for a secret filter outside the kit, such as the runner
   * bridge's. Read it again for each runner start, so a changed value is
   * filtered too. Only Halonic's side ever calls it.
   */
  readonly readSecrets: () => Promise<SecretOnWire[]>;
}

/**
 * Checks an integration against its permission sheet and builds its host. The
 * sheet must pass its schema, the code must be exactly what the sheet
 * declares, a local integration's sheet must be the one the user approved,
 * every need must be available, and the workspace's choices must fit the
 * sheet. Nothing is sent: call `integration.connect(loaded.host)` next.
 *
 * @example
 * const loaded = loadIntegration({ source: { origin: "built-in", sheet, integration: weather }, transport, secrets, tokens });
 * if (loaded.ok) connections.set("weather", loaded.value.integration.connect(loaded.value.host));
 */
export function loadIntegration(
  options: LoadIntegrationOptions,
): Result<LoadedIntegration, LoadProblem[]> {
  const { integration } = options.source;
  const prepared = prepare(options, (sheet) => declarationProblems(sheet, integration));
  if (!prepared.ok) {
    return prepared;
  }
  const { readSecrets: _readSecrets, ...loaded } = prepared.value;
  return ok({ ...loaded, integration });
}

/**
 * Does every check {@link loadIntegration} does except the one on the code,
 * and builds the host. The caller checks the code against the sheet itself
 * with {@link declarationProblems} once it knows what the code declares.
 *
 * @example
 * const prepared = prepareIntegration({ source: { origin: "local", sheet, approvedSheet }, transport, secrets, tokens });
 * if (prepared.ok) runner = await startRunner({ http: prepared.value.host.http, ... });
 */
export function prepareIntegration(
  options: PrepareIntegrationOptions,
): Result<PreparedIntegration, LoadProblem[]> {
  return prepare(options, () => []);
}

/** The checks both entries share; `codeProblems` checks the code, where there is code to check. */
function prepare(
  options: PrepareIntegrationOptions,
  codeProblems: (sheet: IntegrationSheet) => LoadProblem[],
): Result<PreparedIntegration, LoadProblem[]> {
  const { source } = options;
  const parsed = parseIntegrationSheet(source.sheet);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  const sheet = parsed.value;
  const settings = options.choices?.settings ?? {};
  const secretNames = options.choices?.secretNames ?? {};
  const problems = [
    ...approvalProblems(source, sheet),
    ...localTokenProblems(source, sheet),
    ...codeProblems(sheet),
    ...needProblems(sheet, options.capabilities ?? []),
    ...secretChoiceProblems(sheet, secretNames),
  ];
  const resolved = integrationPolicy(sheet, settings);
  if (!resolved.ok) {
    problems.push(...resolved.error);
  }
  if (problems.length > 0 || !resolved.ok) {
    return err(problems);
  }
  const secrets = chosenSecrets(options.secrets, secretNames);
  const { host, log } = createIntegrationHost({
    policy: resolved.value.policy,
    transport: options.transport,
    secrets,
    tokens: options.tokens,
    settings,
    ...(resolved.value.limits ? { limits: requestLimits(resolved.value.limits) } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const readSecrets = () => secretsOnWire(sheet, secrets);
  return ok({ origin: source.origin, sheet, host, log, readSecrets });
}

/**
 * Maps a workspace's provider entry onto the sheet, so the integration can
 * ignore `ProviderConfig.baseUrl` and `.secret`: the `baseUrl` becomes the
 * setting the sheet's one `{ fromSetting }` host reads, and the workspace
 * secret becomes the sheet's one secret.
 *
 * @example
 * providerChoices(sheet, { id: "local", type: "ollama", baseUrl: "http://localhost:11434", local: true, options: {} });
 * // ok({ settings: { url: "http://localhost:11434" }, secretNames: {} })
 */
export function providerChoices(
  sheet: IntegrationSheet,
  config: ProviderConfig,
): Result<Required<WorkspaceChoices>, LoadProblem[]> {
  const problems: LoadProblem[] = [];
  const settings: Record<string, unknown> = {};
  const secretNames: Record<string, string> = {};
  if (config.baseUrl !== undefined) {
    const fromSettings = [
      ...new Set(
        sheet.hosts.flatMap((host) => (typeof host === "string" ? [] : [host.fromSetting])),
      ),
    ];
    const [setting] = fromSettings;
    if (fromSettings.length === 1 && setting !== undefined) {
      settings[setting] = config.baseUrl;
    } else {
      problems.push({
        code: "base-url-not-mapped",
        path: ["hosts"],
        message: `${sheet.id}: provider "${config.id}" sets an address, so the sheet needs exactly one { fromSetting } host, not ${fromSettings.length}`,
      });
    }
  }
  if (config.secret !== undefined) {
    const names = Object.keys(sheet.secrets);
    const [name] = names;
    if (names.length === 1 && name !== undefined) {
      secretNames[name] = config.secret;
    } else {
      problems.push({
        code: "secret-not-mapped",
        path: ["secrets"],
        message: `${sheet.id}: provider "${config.id}" picks a secret, so the sheet needs exactly one secret, not ${names.length}`,
      });
    }
  }
  return problems.length > 0 ? err(problems) : ok({ settings, secretNames });
}

function approvalProblems(
  source: PrepareIntegrationOptions["source"],
  sheet: IntegrationSheet,
): LoadProblem[] {
  if (source.origin !== "local") {
    return [];
  }
  const approved =
    source.approvedSheet === undefined ? undefined : parseIntegrationSheet(source.approvedSheet);
  if (approved?.ok && deepEqual(approved.value, sheet)) {
    return [];
  }
  return [
    {
      code: "sheet-not-approved",
      path: [],
      message: `${sheet.id}: this local integration's permission sheet isn't the one you approved; approve it again`,
    },
  ];
}

/**
 * A local integration runs in the runner, and no token value crosses into it
 * (I5 design HAL-958, section 3.5): its sheet can't declare `tokens` (A32).
 * Tokens as handles are the follow-up HAL-984. Built-in ones keep `tokens`.
 */
function localTokenProblems(
  source: PrepareIntegrationOptions["source"],
  sheet: IntegrationSheet,
): LoadProblem[] {
  if (source.origin !== "local" || sheet.tokens.length === 0) {
    return [];
  }
  return [
    {
      code: "tokens-not-allowed",
      path: ["tokens"],
      message: `${sheet.id}: an integration you build or change can't hold sign-in secrets yet`,
      fix: "Remove tokens from its sheet and use an API key, or ask for sign-in support.",
    },
  ];
}

function needProblems(sheet: IntegrationSheet, capabilities: readonly string[]): LoadProblem[] {
  return sheet.needs.flatMap((need, index) =>
    capabilities.includes(need)
      ? []
      : [
          {
            code: "need-not-available",
            path: ["needs", index],
            message: `${sheet.id}: needs "${need}", which this Halonic doesn't offer here`,
          },
        ],
  );
}

function secretChoiceProblems(
  sheet: IntegrationSheet,
  secretNames: Readonly<Record<string, string>>,
): LoadProblem[] {
  return Object.keys(secretNames).flatMap((name) =>
    Object.hasOwn(sheet.secrets, name)
      ? []
      : [
          {
            code: "secret-not-declared",
            path: ["secrets"],
            message: `${sheet.id}: a workspace secret was picked for "${name}", which the sheet doesn't declare`,
          },
        ],
  );
}

/** The sheet's limits as the kit takes them: only the ones the sheet sets. */
function requestLimits(limits: Readonly<Record<string, number | undefined>>): RequestLimits {
  return Object.fromEntries(
    Object.entries(limits).filter((entry): entry is [string, number] => entry[1] !== undefined),
  );
}

/**
 * The raw secrets seen through the user's picks: the kit asks by the sheet's
 * name and reads the workspace secret picked for it, or nothing. The workspace
 * chose those names, so they can't reach Halonic's own secrets or tokens.
 */
function chosenSecrets(raw: Secrets, secretNames: Readonly<Record<string, string>>): Secrets {
  const picks = new Map(Object.entries(secretNames));
  const workspace = workspaceSecrets(raw);
  return {
    get: async (name) => {
      const picked = picks.get(name);
      return picked === undefined ? null : await workspace.get(picked);
    },
  };
}

/**
 * Each declared secret with a value, and its one placement, as {@link PreparedIntegration.readSecrets} gives them.
 *
 * @throws {IntegrationRefusedError} `secret-too-short` for a value the filter can't safely remove
 */
async function secretsOnWire(sheet: IntegrationSheet, secrets: Secrets): Promise<SecretOnWire[]> {
  const read = Object.entries(sheet.secrets).map(async ([name, declared]) => {
    const value = await secrets.get(name);
    if (value === null) return [];
    checkSecretLength(sheet.id, name, value);
    return [{ value, placements: [placementOf(name, declared)] }];
  });
  return (await Promise.all(read)).flat();
}

/** Where the sheet puts one secret, as the request names it. */
function placementOf(secret: string, declared: IntegrationSecret): SecretPlacement {
  switch (declared.as) {
    case "bearer":
      return { secret, as: "bearer" };
    case "header":
      return {
        secret,
        as: "header",
        header: declared.header,
        ...(declared.prefix === undefined ? {} : { prefix: declared.prefix }),
      };
    case "form":
      return { secret, as: "form", field: declared.field };
  }
}
