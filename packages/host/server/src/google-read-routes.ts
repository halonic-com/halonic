import { type SetupRecord, savedConnectorState, setupSteps } from "@halonicjs/google-setup";
import type { GoogleSetupReadPorts, RequestContext } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { readSetup } from "./google-read-setup.ts";
import { signInPlaceOf } from "./sign-in-place.ts";

/** What `GET /api/google/setups/<ref>` says about a setup, and each entry of the list. Nothing secret is in it, and not even the secret's ref. */
async function setupView(
  { source }: GoogleSetupReadPorts,
  record: SetupRecord,
): Promise<Record<string, unknown> | null> {
  const subject = await source.describe(record.accountRef);
  if (subject === null) {
    return null;
  }
  return {
    accountRef: record.accountRef,
    // What a window needs to draw the setup as the computer does: the connector's address, the
    // services its sheets offer and the route. None of them is secret.
    account: subject.account,
    available: subject.services,
    route: record.route,
    accountType: record.accountType,
    startedAt: record.startedAt,
    projectId: record.projectId,
    stepsDone: record.stepsDone,
    inProductionTickedAt: record.inProductionTickedAt,
    clientId: record.clientId,
    clientSecretSavedAt: record.clientSecret?.savedAt ?? null,
    signInStartedAt: record.signInStartedAt,
    refreshRefused: record.refreshRefused,
    lastSignInAt: record.lastSignInAt,
    wrongAccountAt: record.wrongAccountAt,
    lastSignInEnded: record.lastSignInEnded,
    services: record.services,
    problem: savedConnectorState(record),
    steps: setupSteps({
      route: record.route,
      accountType: record.accountType,
      account: subject.account,
      ...(record.projectId === null ? {} : { projectId: record.projectId }),
      services: subject.services,
    }),
  };
}

/** The read-only Google routes: one setup, and the list with where the browser is. */
export function createGoogleReadRoutes(read: GoogleSetupReadPorts) {
  return {
    /** `GET /api/google/setups/<ref>`: the progress and the steps. */
    async show(accountRef: string): Promise<Response> {
      const record = await readSetup(read.setups, accountRef);
      const view = record === null ? null : await setupView(read, record);
      return view === null ? errorResponse(serverErrors.googleSetupNotFound) : Response.json(view);
    },
    /**
     * `GET /api/google/setups`: every setup whose account a connector still uses, and `signIn`,
     * whether this browser is `here` on the computer that runs Halonic or `elsewhere` (the
     * two-check rule of `signInPlace`). The window reads it once: it decides whether
     * **Sign in with Google** or the `halonic google sign-in <ref>` command is shown.
     */
    async list(request: Request, context: RequestContext): Promise<Response> {
      const views = await Promise.all(
        (await read.setups.list()).map((record) => setupView(read, record)),
      );
      return Response.json({
        signIn: signInPlaceOf(request, context),
        setups: views.filter((view) => view !== null),
      });
    },
  };
}
