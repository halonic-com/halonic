// `halonic google sign-in <account> --connection <id>`: signs a Google account
// in on this computer. The connection (a Google connector of the workspace)
// gives the address that must sign in; the integrations of the workspace that
// ask for Google scopes give the services. The command prints the sign-in
// address (or opens it, where a browser opener is given) and waits for
// Google's answer on a loopback port. The sign-in package does the rest.
// Nothing here prints the connection's address, the code or a token: a
// failure is told by its kind only.

import { realpath } from "node:fs/promises";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import type { ServiceCheckOutcome, SetupService } from "@halonicjs/google-setup";
import {
  createPendingSignIns,
  finishGoogleSignIn,
  type GoogleSignInResult,
  startGoogleSignIn,
} from "@halonicjs/host-google-sign-in";
import type { Clock, HttpClient } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import { filesOf, type LocalIntegrationInput, loadWorkspace } from "@halonicjs/workspace";
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
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { workspaceIntegrations, workspaceNameOf } from "../../workspace-trust.ts";
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
 * @throws UsageError without an account or `--connection`, or with more
 * @throws OwnLineError for each way the sign-in can end without tokens saved
 */
export async function signInGoogle(
  input: CommandInput,
  context: CommandContext,
  setup: GoogleSetup & GoogleSignInMachine,
): Promise<CommandResult> {
  const [accountRef, ...extra] = input.positionals;
  const typedConnection = input.options["connection"];
  if (accountRef === undefined || typeof typedConnection !== "string" || extra.length > 0) {
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
  if (!(await host.tokenKeyIsSet())) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.secretNeedsTokenKey(),
      googleMessages.secretNeedsTokenKeyFix(),
    );
  }

  const dir = await openWorkspaceDir(input, context);
  const workspace = await loadWorkspace(dir.store);
  const name = workspaceNameOf(workspace, dir);
  const connections = filesOf(workspace, "connector").map((file) => file.value);
  const connection = connections.find((candidate) => candidate.id === typedConnection);
  if (connection === undefined) {
    const near = nearMatch(
      typedConnection,
      connections.map((candidate) => candidate.id),
    );
    throw new OwnLineError(
      "not_found",
      googleMessages.unknownConnection(printable(typedConnection), printable(name)),
      near === undefined
        ? googleMessages.seeConnections()
        : googleMessages.didYouMean(printable(near)),
    );
  }
  if (!("google" in connection.transport)) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.notGoogle(printable(typedConnection)),
      googleMessages.notGoogleFix(),
    );
  }
  const services = googleServices(await workspaceIntegrations(await realpath(dir.root), dir.shown));
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
      address: connection.transport.google.account,
      services,
      ...(record.projectId === null ? {} : { projectId: record.projectId }),
    });
    return await told(result, host.setups, services, ahead);
  } finally {
    await listener.close();
  }
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

/** Every integration that asks for Google scopes, as the setup's services. */
function googleServices(integrations: readonly LocalIntegrationInput[]): SetupService[] {
  return integrations.flatMap(({ sheet }) => {
    const scopes = sheet.googleScopes ?? [];
    if (scopes.length === 0) {
      return [];
    }
    return [
      {
        id: sheet.id,
        label: sheet.id,
        googleApis: sheet.googleApis ?? [],
        googleScopes: scopes.map(({ scope, reason, restricted }) => ({
          scope,
          reason,
          ...(restricted === undefined ? {} : { restricted }),
        })),
        ...(sheet.googleCheck === undefined ? {} : { googleCheck: sheet.googleCheck }),
      },
    ];
  });
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
  const opened = (await run.setup.openBrowser?.(url)) ?? false;
  if (!opened) {
    for (const line of [googleMessages.signInOpenThis().phrase, plainLine(url)]) {
      run.ahead.push(line);
      context.printAhead(line);
    }
  }
  const waitingLine = context.progress(googleMessages.signInWaiting().phrase);

  const waiting = AbortSignal.any([
    context.signal,
    AbortSignal.timeout(run.setup.waitMs ?? signInWaitMs),
  ]);
  const query = await run.listener.firstCallback(waiting, new URL(url).searchParams.get("state") ?? "");
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
    http: run.setup.http ?? createNodeHttpClient({ hostClass: googleHostClass }),
    tokens: host.tokens,
    clock: run.clock,
    readClientSecret: (clientRef) => host.clientSecrets.readClientSecret(clientRef),
  });
  if (result.kind !== "signedIn") {
    await host.setups.update(accountRef, { kind: "sign-in-dropped" });
  }
  return result;
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
