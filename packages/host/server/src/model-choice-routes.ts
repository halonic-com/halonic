import type { ModelChoiceSaved, ModelChoiceService } from "@halonicjs/app";
import type { RequestContext, ServerPorts } from "./api.ts";
import { errorResponse, type ServerError, serverErrors } from "./errors.ts";
import {
  readChoiceRequest,
  readContinueRequest,
  readKeyProvider,
  readTestId,
  readTestRequest,
} from "./model-choice-request.ts";
import { isJsonRequest } from "./run-routes.ts";
import { isLoopbackRequest, isSecureConnection } from "./security.ts";

/** The addresses of the first run's model choice: `/api/model-choice/<endpoint>`. */
export const modelChoicePathPrefix = "/api/model-choice/";

/** The one model choice route that can carry a key. */
const testPath = `${modelChoicePathPrefix}test`;

/** Whether a path is the route that takes a pasted key, which the request log leaves out entirely. */
export function isModelChoiceKeyPath(pathname: string): boolean {
  return pathname === testPath;
}

/** Each test spends the person's key, so a session gets 10 tests per 15 minutes. */
const testWindowMs = 15 * 60 * 1000;
const testsPerWindow = 10;
const testCountKeyPrefix = "model-choice-tests:";

/** The headers of every answer, refusals included: a test's outcome or a key's state is not for a cache. */
const noStore = { "cache-control": "no-store" };

function refuse(error: ServerError, headers: Record<string, string> = {}): Response {
  return errorResponse(error, { ...noStore, ...headers });
}

function answer(body: unknown): Response {
  return Response.json(body, { headers: noStore });
}

/** One request to a model choice route, once the route is known and the request is the page's own. */
interface ChoiceCall {
  readonly request: Request;
  readonly context: RequestContext;
  readonly body: Uint8Array;
  /** The path segment after the endpoint's name, such as the provider of `key-saved/<provider>`. */
  readonly argument: string;
  readonly session: string;
  readonly service: ModelChoiceService;
}

/** The routes by `<method> <endpoint>`; the ones with a path argument end in `/`. */
const endpoints = [
  "POST test",
  "POST line-facts",
  "POST continue",
  "GET local-models",
  "GET key-saved/",
  "GET preview/",
] as const;

type Endpoint = (typeof endpoints)[number];

/** The endpoint a method and path name, with its path argument; `null` for any other address. */
function findEndpoint(
  method: string,
  rest: string,
): { readonly endpoint: Endpoint; readonly argument: string } | null {
  const slash = rest.indexOf("/");
  const name = slash === -1 ? rest : rest.slice(0, slash + 1);
  const argument = slash === -1 ? "" : rest.slice(slash + 1);
  const endpoint = endpoints.find((known) => known === `${method} ${name}`);
  if (endpoint === undefined || argument.includes("/")) {
    return null;
  }
  return endpoint.endsWith("/") === (slash !== -1) ? { endpoint, argument } : null;
}

/**
 * Refuses a request a browser says comes from another site. A request with no such header is a
 * script, and passes; the sign-in and the server's origin check still hold.
 */
function refuseOtherSite(request: Request): ServerError | null {
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" ? null : serverErrors.fromOtherSite;
}

/** A choice file as a workspace names it: `models.yaml`, `workspace.yaml` or `providers/<name>.yaml`. */
const choiceFilePattern =
  /^(?:models\.yaml|workspace\.yaml|providers\/[a-z0-9][a-z0-9-]{0,62}\.yaml)$/;

/**
 * What a failed Continue tells the browser: the step and whether the key was saved, never the
 * reason's words. Files with uncommitted changes are named, so the screen can say which; only a
 * choice file's own workspace path passes, never a path of the host's.
 */
function savedAnswer(saved: ModelChoiceSaved): unknown {
  if (saved.ok) return saved;
  const answer = { ok: false, failed: saved.failed, keySaved: saved.keySaved };
  if (saved.failed !== "not-committed") return answer;
  return { ...answer, files: saved.files.filter((file) => choiceFilePattern.test(file)) };
}

export interface ModelChoiceRoutes {
  /** Answers `/api/model-choice/<rest>` for a signed-in `session`; the caller has checked the sign-in. */
  handle(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    rest: string,
    session: string,
  ): Promise<Response>;
}

/**
 * The first run's model choice over HTTP, for a browser on `halonic serve` (HAL-14808). Every
 * route works on the signed-in session's own service, so a passed test belongs to that session.
 *
 * The checks run in a fixed order, and every one up to the body uses only the URL and the headers:
 * no port (404), address (404), other site (403), content type (415, `POST`), then the body (400).
 * A test with a key also needs HTTPS or a loopback name (403), and each session may start only so
 * many tests (429). No answer, log line or error holds a key.
 */
export function createModelChoiceRoutes({
  modelChoice,
  coordination,
  clock,
  errorLog,
}: Pick<ServerPorts, "modelChoice" | "coordination" | "clock" | "errorLog">): ModelChoiceRoutes {
  /** A key goes over HTTPS or stays on this computer. There is no way to confirm plain http. */
  function refuseInsecureKey(call: ChoiceCall): ServerError | null {
    const safeToSend =
      isSecureConnection(call.request, call.context) || isLoopbackRequest(call.request);
    return safeToSend ? null : serverErrors.keyNeedsSecureConnection;
  }

  /** Counts one test for the session; the refusal to answer when it is over the limit, or `null`. */
  async function countTest(session: string): Promise<Response | null> {
    const count = await coordination.countInWindow(
      `${testCountKeyPrefix}${session}`,
      testWindowMs,
      testsPerWindow,
    );
    if (count.allowed) {
      return null;
    }
    const waitMs = Date.parse(count.resetAt) - clock.now().getTime();
    return refuse(serverErrors.tooManyTests, {
      "Retry-After": String(Math.max(1, Math.ceil(waitMs / 1000))),
    });
  }

  async function test(call: ChoiceCall): Promise<Response> {
    const parsed = readTestRequest(call.body);
    if (parsed === null) {
      return refuse(serverErrors.badRequest);
    }
    const insecure = parsed.key === undefined ? null : refuseInsecureKey(call);
    if (insecure !== null) {
      return refuse(insecure);
    }
    const overLimit = await countTest(call.session);
    return overLimit ?? answer(await call.service.test(parsed.choice, parsed.key));
  }

  const handlers: Record<Endpoint, (call: ChoiceCall) => Promise<Response>> = {
    "POST test": test,
    "POST line-facts": async ({ body, service }) => {
      const choice = readChoiceRequest(body);
      if (choice === null) {
        return refuse(serverErrors.badRequest);
      }
      return answer({ line: (await service.lineFacts(choice)) ?? null });
    },
    // Continue never trusts the folder from here: trust stays a step at the computer (D2).
    "POST continue": async ({ body, service }) => {
      const testId = readContinueRequest(body);
      if (testId === null) {
        return refuse(serverErrors.badRequest);
      }
      const saved = await service.continue(testId, undefined);
      if (!saved.ok && (saved.failed === "key" || saved.failed === "write")) {
        errorLog.record(new Error(`Saving a model choice failed: ${saved.reason}`));
      }
      return answer(savedAnswer(saved));
    },
    // The cause of a `not-found` is the host's own error, which can name its paths: it stays here.
    "GET local-models": async ({ service }) => {
      const models = await service.localModels();
      return answer(models.kind === "not-found" ? { kind: "not-found" } : models);
    },
    "GET key-saved/": async ({ argument, service }) => {
      const provider = readKeyProvider(argument);
      if (provider === null) {
        return refuse(serverErrors.notFound);
      }
      return answer({ saved: await service.keySaved(provider) });
    },
    // Without the fingerprint: nothing a browser sends can make Continue trust (D2).
    "GET preview/": async ({ argument, service }) => {
      const testId = readTestId(argument);
      const preview = testId === null ? undefined : await service.preview(testId);
      return answer({
        preview:
          preview === undefined
            ? null
            : { reaches: preview.reaches, localOnlyOff: preview.localOnlyOff },
      });
    },
  };

  /** Runs a handler. A failure reaches the error log as it is, and the caller gets a fixed 500. */
  async function attempt(endpoint: Endpoint, call: ChoiceCall): Promise<Response> {
    try {
      return await handlers[endpoint](call);
    } catch (cause) {
      errorLog.record(cause);
      return refuse(serverErrors.internal);
    }
  }

  return {
    async handle(request, context, body, rest, session) {
      if (modelChoice === undefined) {
        return refuse(serverErrors.modelChoiceNotSupported);
      }
      const found = findEndpoint(request.method, rest);
      if (found === null) {
        return refuse(serverErrors.notFound);
      }
      const notJson = request.method === "POST" && !isJsonRequest(request);
      const refusal =
        refuseOtherSite(request) ?? (notJson ? serverErrors.unsupportedMediaType : null);
      if (refusal !== null) {
        return refuse(refusal);
      }
      const service = modelChoice.forSession(session);
      const { argument } = found;
      return attempt(found.endpoint, { request, context, body, argument, session, service });
    },
  };
}
