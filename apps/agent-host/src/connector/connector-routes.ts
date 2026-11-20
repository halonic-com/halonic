import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { defaultWorkingFolder } from "@halonicjs/format";
import {
  type ConnectorCallOptions,
  type ConnectorFactory,
  type ConnectorFactoryContext,
  type HttpClient,
  isConnectorToolError,
  type Secrets,
  type TokenStore,
  type TrustStore,
} from "@halonicjs/ports";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { namedWorkspace } from "../server/named-workspace.ts";
import { connectorFailureReasonOf } from "./connector-failure.ts";
import {
  callToolBody,
  configOf,
  connectorBody,
  type OpenConnectorBody,
  openConnectorBody,
} from "./connector-schemas.ts";
import type { ConnectorTable } from "./connector-table.ts";
import { checkTrustGrant } from "./trust-check.ts";

/** What the connector routes reach: the factory, the folders the launcher named, and what a start needs. */
export interface ConnectorRouteDeps {
  /** Starts a `stdio` connector: sandboxed where the host's own check passes (`SessionWorkspaceFactory`). */
  factory: ConnectorFactory;
  connectors: ConnectorTable;
  /**
   * The folders the launcher named as workspaces (the `--sweep-root`s, without
   * Halonic's own profile folder). A connector's workspace must be one of them.
   */
  workspaceRoots: readonly string[];
  /** What a pinned package's lookup reaches the registry with. */
  http: HttpClient;
  tokens: TokenStore;
  /**
   * The trust records of the user's profile, which the host reads itself
   * before it starts any program. `undefined` when the host has no profile
   * folder: nothing is trusted then, and no connector opens.
   */
  trustStore: TrustStore | undefined;
  /** Where the host writes what it keeps from a failure; the answer never carries it. */
  log?: (text: string) => void;
}

const connectorFailedMessage =
  "The connector couldn't finish this request. The agent host's log has the detail.";

const unknownConnectorMessage = "The agent host has no open connector with this id.";

/**
 * The `ConnectorClient` port over loopback, so Studio can give the engine a
 * stand-in for a workspace `stdio` connector that runs here, in a sandbox
 * session the host opens itself (D45):
 *
 * - `POST /v1/connectors/open` with the connector as its file says it, its
 *   own secrets' values, the workspace folder, the agents' working folders and
 *   the trust grant answers `{ connector }`: an id. The host builds the
 *   connector's place; there is no profile in the request. The program starts
 *   on the first call. It answers 403 `workspace_not_trusted` when the host's own
 *   trust record doesn't cover the connector as the request describes it (the
 *   grant in the request is only a claim), and starts nothing; 403 `workspace_not_named` when the
 *   workspace isn't one of the launcher's folders, 429 `too_many_connectors`
 *   when the table is full, 503 `host_stopping` once the host stops;
 * - `POST /v1/connectors/tools` with `{ connector }` answers its `ConnectorTool[]`;
 * - `POST /v1/connectors/call` with `{ connector, tool, args, idempotencyKey? }` answers `{ text }`,
 *   or `{ toolError }` with the tool's own text when the tool answered with an
 *   error (`ConnectorToolError`): the call is over and failed, it didn't break off;
 * - `POST /v1/connectors/close` with `{ connector }` stops the program and closes its session.
 *
 * A failed start or call (the program died, the connection dropped, it ran
 * out of time) answers 502 `connector_failed` with a fixed message, and a
 * `reason` when the host knows why (`ConnectorFailureReason`): the
 * error's own text can hold paths or secret values, so it goes only to the
 * host's own log (`deps.log`), with the connector's secret values left out.
 */
export function connectorRoutes(deps: ConnectorRouteDeps): HostRoute[] {
  const { connectors } = deps;
  return [
    { method: "POST", path: "/v1/connectors/open", handle: openHandler(deps) },
    {
      method: "POST",
      path: "/v1/connectors/tools",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, connectorBody);
        if (body === undefined) return;
        const client = connectors.get(body.connector);
        if (client === undefined) return sendUnknown(response);
        await answering(deps, body.connector, response, async () =>
          sendJson(response, 200, await client.listTools()),
        );
      },
    },
    {
      method: "POST",
      path: "/v1/connectors/call",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, callToolBody);
        if (body === undefined) return;
        const client = connectors.get(body.connector);
        if (client === undefined) return sendUnknown(response);
        const options: ConnectorCallOptions =
          body.idempotencyKey === undefined ? {} : { idempotencyKey: body.idempotencyKey };
        await answering(deps, body.connector, response, async () => {
          const called = await calledOrToolError(() =>
            client.callTool(body.tool, body.args, options),
          );
          sendJson(response, 200, called);
        });
      },
    },
    {
      method: "POST",
      path: "/v1/connectors/close",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, connectorBody);
        if (body === undefined) return;
        await answering(deps, body.connector, response, async () => {
          if (await connectors.close(body.connector)) sendJson(response, 200, { closed: true });
          else sendUnknown(response);
        });
      },
    },
  ];
}

/**
 * The call's answer: the tool's text, or what the tool said about its own
 * failure. The tool's text crosses as a normal answer's text does: it is the
 * server's, and the engine fences it as untrusted. Any other error is thrown,
 * so it answers 502 and its detail stays in the host's log.
 */
async function calledOrToolError(
  call: () => Promise<string>,
): Promise<{ text: string } | { toolError: string }> {
  try {
    return { text: await call() };
  } catch (error) {
    if (isConnectorToolError(error)) return { toolError: error.toolText };
    throw error;
  }
}

function openHandler(deps: ConnectorRouteDeps): HostRoute["handle"] {
  const { connectors } = deps;
  return async (request, response) => {
    const body = await readCheckedBody(request, response, openConnectorBody);
    if (body === undefined) return;
    if (connectors.isStopping) {
      sendHostStopping(response);
      return;
    }
    const release = connectors.reserve();
    if (release === undefined) {
      sendError(
        response,
        429,
        "too_many_connectors",
        "The agent host already has the most connectors it allows. Close one first.",
      );
      return;
    }
    try {
      const context = await allowedContextOf(deps, body, response);
      if (context === undefined) return;
      const client = deps.factory.create(configOf(body), context);
      const id = connectors.add(client, Object.values(body.secrets));
      if (id === undefined) {
        // The host began stopping while the folders were checked: nothing else will close this one.
        await client.close();
        sendHostStopping(response);
        return;
      }
      sendJson(response, 200, { connector: id });
    } catch (error) {
      failed(deps, response, error, Object.values(body.secrets));
    } finally {
      release();
    }
  };
}

/**
 * The start's context once the host allows it: the workspace is one it was
 * given, every working folder is inside it, and the trust grant covers it.
 *
 * @returns undefined after answering 403 when it doesn't
 */
async function allowedContextOf(
  deps: ConnectorRouteDeps,
  body: OpenConnectorBody,
  response: Parameters<typeof sendError>[0],
): Promise<(ConnectorFactoryContext & { workspaceRoot: string }) | undefined> {
  const context = await contextOf(deps, body);
  if (context === undefined) {
    sendError(
      response,
      403,
      "workspace_not_named",
      "The workspace folder isn't one the agent host was given.",
    );
    return undefined;
  }
  if (context === "folder_outside") {
    sendError(
      response,
      403,
      "working_folder_outside_workspace",
      "An agent working folder isn't inside the workspace folder.",
    );
    return undefined;
  }
  if ((await checkTrustGrant(deps.trustStore, context.workspaceRoot, body)) !== undefined) {
    sendError(
      response,
      403,
      "workspace_not_trusted",
      "This computer's trust record doesn't cover this connector in this workspace. Trust the workspace first.",
    );
    return undefined;
  }
  return context;
}

/**
 * What the start is given: the workspace and the agents' folders as real
 * paths (Studio's page can't resolve them), the connector's own secrets and
 * the trust grant, which the host checks against its own record before it
 * starts anything. Nothing else of the host's reaches it.
 *
 * The host owns part of the list: it always adds the folder of the default
 * agent working folders, and refuses a folder outside the workspace.
 *
 * @returns undefined when the workspace isn't one of the launcher's folders,
 *   `"folder_outside"` when a working folder isn't inside it
 */
async function contextOf(
  deps: ConnectorRouteDeps,
  body: OpenConnectorBody,
): Promise<(ConnectorFactoryContext & { workspaceRoot: string }) | "folder_outside" | undefined> {
  const workspaceRoot = await namedWorkspace(deps.workspaceRoots, body.workspaceRoot);
  if (workspaceRoot === undefined) return undefined;
  const given = await Promise.all(body.workingFolders.map(realPathOrGiven));
  if (!given.every((folder) => isInside(workspaceRoot, folder))) return "folder_outside";
  return {
    secrets: memorySecrets(body.secrets),
    tokens: deps.tokens,
    http: deps.http,
    workspaceRoot,
    workingFolders: [...new Set([defaultAgentsFolder(workspaceRoot), ...given])],
    trust: body.trust,
  };
}

/**
 * The folder every default agent working folder is in. The host adds it
 * itself, so an empty or short list from the page never leaves an agent's
 * default folder unchecked.
 */
function defaultAgentsFolder(workspaceRoot: string): string {
  return join(workspaceRoot, defaultWorkingFolder("").replace(/\/$/, ""));
}

/** Whether `folder` is `root` or below it. */
function isInside(root: string, folder: string): boolean {
  const path = relative(root, folder);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** A folder that doesn't exist yet stays as given: the start's check follows it as far as it exists. */
async function realPathOrGiven(path: string): Promise<string> {
  return await realpath(path).catch(() => path);
}

/** Only the values Studio sent: the host never reads a secret store. */
function memorySecrets(values: Readonly<Record<string, string>>): Secrets {
  return {
    get: async (name) => (Object.hasOwn(values, name) ? (values[name] ?? null) : null),
  };
}

/** Runs `answer`, and answers 502 `connector_failed` when it throws. */
async function answering(
  deps: ConnectorRouteDeps,
  connector: string,
  response: Parameters<typeof sendError>[0],
  answer: () => Promise<void>,
): Promise<void> {
  // Read before `answer` runs: a close forgets the connector's values before it can fail.
  const secretValues = deps.connectors.secretValuesOf(connector);
  try {
    await answer();
  } catch (error) {
    failed(deps, response, error, secretValues);
  }
}

/**
 * Answers 502 with the fixed message, and the reason when the error's type
 * says it, and keeps the detail in the host's log.
 *
 * @param secretValues - values to leave out of the log line (the connector's own secrets)
 */
function failed(
  deps: ConnectorRouteDeps,
  response: Parameters<typeof sendError>[0],
  error: unknown,
  secretValues: readonly string[],
): void {
  const name = error instanceof Error ? error.name : "Error";
  deps.log?.(
    `A connector request failed (${name}): ${withoutValues(messageOf(error), secretValues)}\n`,
  );
  const reason = connectorFailureReasonOf(error);
  sendJson(response, 502, {
    error: { kind: "connector_failed", message: connectorFailedMessage, ...reason },
  });
}

function withoutValues(text: string, values: readonly string[]): string {
  // Longest first, so a value that holds a shorter one isn't left half replaced.
  return values
    .filter((value) => value !== "")
    .sort((first, second) => second.length - first.length)
    .reduce((kept, value) => kept.split(value).join("[secret value]"), text);
}

function sendHostStopping(response: Parameters<typeof sendError>[0]): void {
  sendError(
    response,
    503,
    "host_stopping",
    "The agent host is stopping and opens no more connectors.",
  );
}

function sendUnknown(response: Parameters<typeof sendError>[0]): void {
  sendError(response, 404, "unknown_connector", unknownConnectorMessage);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
