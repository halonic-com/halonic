// `halonic google sign-in <account> [--connection <id>]`: signs a Google account
// in on this computer. The connector the setup record is linked to (a Google
// connector of the workspace in `--dir`) gives the address that must sign in; the integrations of the workspace that
// ask for Google scopes give the services. The command prints the sign-in
// address (or opens it, where a browser opener is given) and waits for
// Google's answer on a loopback port. The sign-in package does the rest.
// Nothing here prints the connector's address, the code or a token: a
// failure is told by its kind only.

import { realpath } from "node:fs/promises";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import {
  googleSetupSubject,
  type ServiceCheckOutcome,
  type SetupService,
} from "@halonicjs/google-setup";
import {
  createPendingSignIns,
  finishGoogleSignIn,
  type GoogleSignInResult,
  startGoogleSignIn,
} from "@halonicjs/host-google-sign-in";
import type { Clock, HttpClient } from "@halonicjs/ports";
import { profileFolder, workspaceFolders } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { type GoogleSetup, openGoogleHost } from "../../google-host.ts";
import { type CallbackListener, callbackPath, listenForCallback } from "../../loopback-callback.ts";
import { googleMessages } from "../../messages/google.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { printable } from "../../output/printable.ts";
import { proxySetting } from "../../proxy-setting.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../../workspace-runs.ts";
import { workspaceIntegrations, workspaceNameOf } from "../../workspace-trust.ts";
import { prepareTokenKey } from "./prepare-token-key.ts";
import { readSetup } from "./read-setup.ts";

/** How long the sign-in waits for the browser: the sign-in's own lifetime, 10 minutes. */
export const signInWaitMs = 10 * 60 * 1000;

/** Opens a URL in the browser of this computer. Returns whether a browser could be started. */
export type OpenBrowser = (url: string) => Promise<boolean>;

/** What the sign-in uses beyond the Google setup, so tests can stand in for the browser and Google. */
export interface GoogleSignInMachine {
  /** Talks to Google; the Node client, for Google's hosts only, by default. */
  readonly http?: HttpClient;
  /** Opens the browser. Without one the command prints the address and the person opens it. */
  readonly openBrowser?: OpenBrowser;
  /** Starts the loopback server; a real one on `127.0.0.1` by default. */
  readonly listen?: () => Promise<CallbackListener>;
  /** How long to wait for the browser; 10 minutes by default. */
  readonly waitMs?: number;
}

/** Only Google's own hosts, over `https`: the token endpoint and the services' checks. */
function googleHostClass(url: URL) {
  return url.protocol === "https:" && url.hostname.endsWith(".googleapis.com")
    ? ("public" as const)
    : undefined;
}

/**
 * Signs the account in and records the result.
 *
 * @throws UsageError without an account, or with more
 * @throws OwnLineError for each way the sign-in can end without tokens saved
 */
export async function signInGoogle(
  input: CommandInput,
  context: CommandContext,
  setup: GoogleSetup & GoogleSignInMachine,
): Promise<CommandResult> {
  const [accountRef, ...extra] = input.positionals;
  const typedConnection = input.options["connection"];
  if (
    accountRef === undefined ||
    (typedConnection !== undefined && typeof typedConnection !== "string") ||
    extra.length > 0
  ) {
    throw new UsageError(googleMessages.signInNeedsMore(), googleMessages.signInUsage());
  }
  const host = openGoogleHost(setup);
  const record = await readSetup(host.setups, accountRef);
  if (record.clientId === null) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.signInNoClientId(),
      googleMessages.signInNoClientIdFix(),
    );
  }
  if (record.clientSecret === null) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.signInNoSecret(),
      googleMessages.signInNoSecretFix(),
    );
  }
  await prepareTokenKey(host);

  const dir = await openWorkspaceDir(input, context);
  const workspace = await loadWorkspace(dir.store);
  const name = workspaceNameOf(workspace, dir);
  const location = await realpath(dir.root);
  const key = await workspaceKeyOf(setup, location);
  const link = record.connector;
  if (link.workspace !== key) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.signInOtherWorkspace(),
      googleMessages.signInOtherWorkspaceFix(),
    );
  }
  if (typedConnection !== undefined && typedConnection !== link.id) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.signInOtherConnection(printable(typedConnection)),
      googleMessages.signInOtherConnectionFix(),
    );
  }
  const connections = filesOf(workspace, "connector").map((file) => file.value);
  const subject = googleSetupSubject(
    connections,
    await workspaceIntegrations(location, dir.shown),
    link.id,
  );
  if (subject.kind === "noConnector") {
    throw new OwnLineError(
      "not_found",
      googleMessages.unknownConnection(printable(link.id), printable(name)),
      googleMessages.seeConnections(),
    );
  }
  if (subject.kind === "notGoogle") {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.notGoogle(printable(link.id)),
      googleMessages.notGoogleFix(),
    );
  }
  const { services } = subject;
  if (services.length === 0) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.signInNoServices(printable(name)),
      googleMessages.signInNoServicesFix(),
    );
  }

  const clock = setup.clock ?? systemClock;
  const listener = await listen(setup);
  try {
    const ahead: Phrase[] = [];
    const result = await runSignIn({
      ahead,
      context,
      setup,
      clock,
      listener,
      host,
      accountRef,
      clientId: record.clientId,
      clientRef: record.clientSecret.clientRef,
      address: subject.address,
      services,
      ...(record.projectId === null ? {} : { projectId: record.projectId }),
    });
    return await told(result, host.setups, services, ahead);
  } finally {
    await listener.close();
  }
}

/** The workspace's key in the profile, as the record's link names it. */
async function workspaceKeyOf(setup: GoogleSetup, location: string): Promise<string> {
  const folders = await workspaceFolders(
    profileFolder(setup.profile ?? nodeProfileEnvironment()),
    location,
    webCryptoDigest,
  );
  return folders.key;
}

async function listen(setup: GoogleSignInMachine): Promise<CallbackListener> {
  try {
    return await (setup.listen ?? listenForCallback)();
  } catch {
    throw new OwnLineError(
      "unavailable",
      googleMessages.signInNoPort(),
      googleMessages.signInNoPortFix(),
    );
  }
}

interface SignInRun {
  /** The lines printed ahead, which the result repeats first. */
  readonly ahead: Phrase[];
  readonly context: CommandContext;
  readonly setup: GoogleSetup & GoogleSignInMachine;
  readonly clock: Clock;
  readonly listener: CallbackListener;
  readonly host: ReturnType<typeof openGoogleHost>;
  readonly accountRef: string;
  readonly clientId: string;
  readonly clientRef: string;
  /** The connector's address. Personal data: never printed or logged. */
  readonly address: string;
  readonly services: readonly SetupService[];
  readonly projectId?: string;
}

/** Starts the sign-in, shows the browser the way, waits for the callback and finishes it. */
async function runSignIn(run: SignInRun): Promise<GoogleSignInResult> {
  const { context, host, accountRef } = run;
  const pendingSignIns = createPendingSignIns(run.clock);
  const url = await startGoogleSignIn(
    {
      accountRef,
      clientId: run.clientId,
      clientRef: run.clientRef,
      redirect: { port: run.listener.port, path: callbackPath },
      account: run.address,
      services: run.services,
      ...(run.projectId === undefined ? {} : { projectId: run.projectId }),
    },
    pendingSignIns,
  );
  await host.setups.update(accountRef, { kind: "sign-in-started" });
  const waiting = AbortSignal.any([
    context.signal,
    AbortSignal.timeout(run.setup.waitMs ?? signInWaitMs),
  ]);
  const answer = run.listener.firstCallback(waiting, new URL(url).searchParams.get("state") ?? "");
  const opened = (await run.setup.openBrowser?.(url)) ?? false;
  if (!opened) {
    for (const line of [
      googleMessages.signInOpenThis().phrase,
      plainLine(withoutAddressHint(url)),
    ]) {
      run.ahead.push(line);
      context.printAhead(line);
    }
  }
  const waitingLine = context.progress(googleMessages.signInWaiting().phrase);
  const query = await answer;
  waitingLine.end();
  if (query === undefined) {
    await host.setups.update(accountRef, { kind: "sign-in-dropped" });
    context.signal.throwIfAborted();
    throw new OwnLineError(
      "unavailable",
      googleMessages.signInTimedOut(),
      googleMessages.signInTimedOutFix(),
    );
  }
  const result = await finishGoogleSignIn(query, {
    pendingSignIns,
    http:
      run.setup.http ?? createNodeHttpClient({ hostClass: googleHostClass, proxy: proxySetting }),
    tokens: host.tokens,
    clock: run.clock,
    readClientSecret: (clientRef) => host.clientSecrets.readClientSecret(clientRef),
  });
  if (result.kind !== "signedIn") {
    await host.setups.update(accountRef, { kind: "sign-in-dropped" });
  }
  return result;
}

/**
 * The sign-in address without `login_hint`, which carries the connector's
 * address. A browser the command opens gets the hint; an address a person
 * copies from the terminal must not, because the terminal's output is kept.
 */
function withoutAddressHint(url: string): string {
  const printable = new URL(url);
  printable.searchParams.delete("login_hint");
  return printable.toString();
}

/** A printed line that is only text, such as an address. */
function plainLine(text: string) {
  return googleMessages.signInOpenThisAddress(text).phrase;
}

/** Records a sign-in and tells how it ended; throws for every end but `signedIn`. */
async function told(
  result: GoogleSignInResult,
  setups: ReturnType<typeof openGoogleHost>["setups"],
  services: readonly SetupService[],
  ahead: readonly Phrase[],
): Promise<CommandResult> {
  if (result.kind !== "signedIn") {
    throw failure(result);
  }
  await setups.update(result.accountRef, { kind: "signed-in" });
  for (const checked of result.services) {
    await setups.update(result.accountRef, {
      kind: "service-checked",
      service: checked.service,
      result: checked.result,
    });
  }
  const label = new Map(services.map((service) => [service.id, service.label]));
  return {
    exitCode: exitCode.ok,
    lines: [
      ...ahead,
      googleMessages.signedIn().phrase,
      ...result.services.map((checked) =>
        serviceLine(printable(label.get(checked.service) ?? checked.service), checked.result),
      ),
    ],
    json: {
      signedIn: true,
      services: result.services.map((checked) => ({
        service: checked.service,
        result: checked.result.kind,
      })),
    },
  };
}

function serviceLine(service: string, outcome: ServiceCheckOutcome) {
  switch (outcome.kind) {
    case "works":
      return googleMessages.serviceWorks(service).phrase;
    case "allowed":
      return googleMessages.serviceAllowed(service).phrase;
    case "scopeNotGranted":
      return googleMessages.serviceScopeMissing(service).phrase;
    case "apiOff": {
      const api = printable(outcome.apiName ?? outcome.api ?? "API");
      return outcome.enableUrl === undefined
        ? googleMessages.serviceApiOffNoLink(service, api).phrase
        : googleMessages.serviceApiOff(service, api, outcome.enableUrl).phrase;
    }
    case "checkFailed":
      return googleMessages.serviceCheckFailed(service).phrase;
    case "unreachable":
      return googleMessages.serviceUnreachable(service).phrase;
  }
}

/** The refusal for a sign-in that saved nothing. Says the kind, never an address, code or token. */
function failure(result: Exclude<GoogleSignInResult, { kind: "signedIn" }>): OwnLineError {
  switch (result.kind) {
    case "cancelled":
      return new OwnLineError("denied", googleMessages.signInCancelled());
    case "adminBlocked":
    case "outsideOrganisation":
      return new OwnLineError(
        "denied",
        googleMessages.signInBlocked(),
        googleMessages.signInBlockedFix(),
      );
    case "wrongAccount":
      return new OwnLineError(
        "denied",
        googleMessages.signInWrongAccount(),
        googleMessages.signInWrongAccountFix(),
      );
    case "wrongClientSecret":
    case "noClientSecret":
      return new OwnLineError(
        "invalid_input",
        googleMessages.signInSecretRefused(),
        googleMessages.signInSecretRefusedFix(),
      );
    case "codeRefused":
      return new OwnLineError(
        "invalid_input",
        googleMessages.signInCodeRefused(),
        googleMessages.signInCodeRefusedFix(),
      );
    case "noRefreshToken":
      return new OwnLineError(
        "invalid_input",
        googleMessages.signInNoRefreshToken(),
        googleMessages.signInNoRefreshTokenFix(),
      );
    case "googleError":
      return new OwnLineError(
        "unavailable",
        googleMessages.signInGoogleError(printable(result.errorCode)),
      );
    case "unreachable":
    case "unexpectedAnswer":
      return new OwnLineError(
        "unavailable",
        googleMessages.signInUnreachable(),
        googleMessages.signInUnreachableFix(),
      );
    case "idTokenRefused":
      return new OwnLineError("unavailable", googleMessages.signInIdTokenRefused());
    case "incompleteCallback":
    case "linkNoLongerValid":
      return new OwnLineError(
        "invalid_input",
        googleMessages.signInBadCallback(),
        googleMessages.signInBadCallbackFix(),
      );
  }
}
