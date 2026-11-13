import type { AddressCheckingHttpClient } from "@halonicjs/adapter-integration-kit";
import { type LoadedIntegration, loadIntegration } from "@halonicjs/adapter-integration-kit";
import { type IntegrationSheet, parseIntegrationSheet } from "@halonicjs/format/integration";
import {
  createIntegrationSignIns,
  createSignInFlow,
  type IntegrationSignIns,
  type SignInFlow,
  type SignInOutcome,
  type SignInSource,
} from "@halonicjs/host-integration-sign-in";
import { createSignInGrants, type SignInGrants } from "@halonicjs/oauth-sign-in";
import type {
  Clock,
  Digest,
  HttpClient,
  IntegrationRequestInit,
  Secrets,
  TokenStore,
} from "@halonicjs/ports";
import { clientSecretName, exampleSheetRecord, signInName } from "./example-sheet.ts";
import {
  type BrowserChoice,
  createFakeOAuthServer,
  type FakeOAuthServer,
} from "./fake-oauth-server.ts";

const loopbackPort = 4711;

/** What a test changes about the rig. */
export interface SignInRigOptions {
  /** Changes the sheet before anything reads it. */
  readonly editSheet?: (sheet: Record<string, unknown>) => void;
  /** The integration's settings. Default: the fake client ID. */
  readonly settings?: Record<string, unknown>;
  /** Fields of the example sign-in to set before anything reads the sheet. A field set to `undefined` is removed. */
  readonly signIn?: Record<string, unknown>;
  /** `undefined` makes the provider a public client, and the rig leaves the client secret unset. */
  readonly clientSecret?: string | undefined;
  /** What the host's sign-in code sends its token requests through. Default: the server itself. */
  readonly signInHttp?: (server: HttpClient) => HttpClient;
}

/** A sign-in that ran from the start to the callback. */
export interface FinishedSignIn {
  readonly outcome: SignInOutcome | undefined;
  /** The page the callback got. */
  readonly page: Response;
  /** The URL the browser went back to. */
  readonly callbackUrl: URL;
}

/**
 * Everything one integration's sign-in needs, wired to the fake OAuth
 * server: the host's sign-in flow and tokens, a store, a clock a test moves,
 * and the kit's real loader over a transport that is the server. Nothing in
 * it is mocked but the network and the browser.
 */
export interface SignInRig {
  readonly server: FakeOAuthServer;
  readonly flow: SignInFlow;
  readonly signIns: IntegrationSignIns;
  readonly grants: SignInGrants;
  /** The token store the grants live in, by the name they are saved under. */
  readonly store: Map<string, string>;
  /** How every sign-in ended, in order. */
  readonly outcomes: SignInOutcome[];
  /** The integration as the kit loaded it, with the host it was given. */
  readonly loaded: LoadedIntegration;
  /** The workspace secrets the client secret is read from, by name. */
  readonly secrets: Map<string, string>;
  /** Moves the clock the host and the provider share. */
  advance(milliseconds: number): void;
  /** Sets fields of the example sign-in in the sheet, as an update does. A field set to `undefined` is removed. */
  editSignIn(fields: Record<string, unknown>): void;
  /** Changes the sheet the host reads from now on, as an update or a hand edit does. The loaded integration keeps the sheet it was loaded with. */
  editSheet(edit: (sheet: Record<string, unknown>) => void): void;
  changeSettings(settings: Record<string, unknown>): void;
  /** Starts a sign-in, lets the user choose at the provider, and gives the browser's callback to the flow. */
  signIn(choice?: BrowserChoice): Promise<FinishedSignIn>;
  /** A request through the kit's host, placing the sign-in's token as a bearer token unless `init.auth` says otherwise. */
  api(url?: string, init?: IntegrationRequestInit): Promise<Response>;
}

/** Builds the rig. */
export function createSignInRig(options: SignInRigOptions = {}): SignInRig {
  let nowMs = Date.UTC(2026, 10, 13);
  const clock: Clock = { now: () => new Date(nowMs) };
  const hasClientSecret = !("clientSecret" in options) || options.clientSecret !== undefined;
  const server = createFakeOAuthServer({
    clock,
    ...("clientSecret" in options ? { clientSecret: options.clientSecret } : {}),
  });
  const sheetRecord = exampleSheetRecord();
  if (!hasClientSecret) removeClientSecret(sheetRecord);
  setSignInFields(sheetRecord, options.signIn ?? {});
  options.editSheet?.(sheetRecord);
  let source: SignInSource = {
    sheet: parseSheet(sheetRecord),
    settings: options.settings ?? { clientId: server.clientId },
  };

  const store = new Map<string, string>();
  const tokenStore: TokenStore = {
    get: async (name) => store.get(name) ?? null,
    set: async (name, value) => void store.set(name, value),
    remove: async (name) => void store.delete(name),
  };
  const grants = createSignInGrants(tokenStore, webDigest);
  const secrets = new Map<string, string>();
  if (hasClientSecret && server.clientSecret !== undefined) {
    secrets.set(clientSecretName, server.clientSecret);
  }
  const secretPort: Secrets = { get: async (name) => secrets.get(name) ?? null };
  const requestSignal = () => new AbortController().signal;
  const outcomes: SignInOutcome[] = [];
  const signInHttp = options.signInHttp?.(server.http) ?? server.http;

  const signIns = createIntegrationSignIns({
    integration: "example",
    current: async () => source,
    grants,
    http: signInHttp,
    secrets: secretPort,
    clock,
    requestSignal,
  });
  const flow = createSignInFlow({
    integration: "example",
    signIns,
    grants,
    http: signInHttp,
    secrets: secretPort,
    clock,
    digest: webDigest,
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    requestSignal,
    onOutcome: (outcome) => void outcomes.push(outcome),
  });
  const loaded = loadExample(
    sheetRecord,
    source.settings,
    server,
    secretPort,
    tokenStore,
    signIns,
    hasClientSecret,
  );

  return {
    server,
    flow,
    signIns,
    grants,
    store,
    outcomes,
    loaded,
    secrets,
    advance(milliseconds) {
      nowMs += milliseconds;
    },
    editSheet(edit) {
      edit(sheetRecord);
      source = { ...source, sheet: parseSheet(sheetRecord) };
    },
    editSignIn(fields) {
      this.editSheet((sheet) => setSignInFields(sheet, fields));
    },
    changeSettings(settings) {
      source = { ...source, settings };
    },
    async signIn(choice) {
      const started = await flow.start(signInName, loopbackPort);
      if (started.kind !== "started") {
        throw new Error(`The example sign-in didn't start: ${started.kind}`);
      }
      const callbackUrl = server.approve(started.authorizeUrl, choice);
      const before = outcomes.length;
      const page = await flow.handleCallback(new Request(callbackUrl));
      return { outcome: outcomes.length > before ? outcomes.at(-1) : undefined, page, callbackUrl };
    },
    api: (url = "https://api.example.com/v1/me", init = {}) =>
      loaded.host.http.fetch(url, { auth: { signIn: signInName, as: "bearer" }, ...init }),
  };
}

/** The kit's real loader, with the server as its transport. */
function loadExample(
  sheet: Record<string, unknown>,
  settings: Readonly<Record<string, unknown>>,
  server: FakeOAuthServer,
  secrets: Secrets,
  tokens: TokenStore,
  signIns: IntegrationSignIns,
  hasClientSecret: boolean,
): LoadedIntegration {
  const result = loadIntegration({
    source: {
      origin: "built-in",
      sheet,
      integration: {
        name: "example",
        version: "1.0.0",
        tools: [],
        connect: () => ({ callTool: async () => "", close: async () => {} }),
      },
    },
    choices: {
      settings,
      secretNames: hasClientSecret ? { [clientSecretName]: clientSecretName } : {},
    },
    // The server answers without a network, so there is no address to check.
    transport: server.http as AddressCheckingHttpClient,
    secrets,
    tokens,
    signInTokens: signIns.tokens,
  });
  if (!result.ok) {
    throw new Error(`The example integration didn't load: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function parseSheet(record: Record<string, unknown>): IntegrationSheet {
  const parsed = parseIntegrationSheet(record);
  if (!parsed.ok) {
    throw new Error(`The example sheet is wrong: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.value;
}

function setSignInFields(sheet: Record<string, unknown>, fields: Record<string, unknown>): void {
  const signIn = (sheet["signIns"] as Record<string, Record<string, unknown>>)[signInName] ?? {};
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) delete signIn[name];
    else signIn[name] = value;
  }
}

/** A public client has no client secret, so the sheet doesn't name one. */
function removeClientSecret(sheet: Record<string, unknown>): void {
  sheet["secrets"] = {};
  const signIns = sheet["signIns"] as Record<string, Record<string, unknown>>;
  delete signIns[signInName]?.["clientSecret"];
}

/** SHA-256 from Web Crypto, for the flow's PKCE and the grants' hash. */
export const webDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(data)));
  },
};
