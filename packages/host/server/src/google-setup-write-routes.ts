import {
  type AccountType,
  type ConnectorLink,
  type SetupEdit,
  SetupRecordError,
  type StepId,
  startOver,
} from "@halonicjs/google-setup";
import type { GoogleSetupPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { readSetup } from "./google-read-setup.ts";
import { refuseOtherSite } from "./secret-request.ts";
import type { WrongAccountNotes } from "./wrong-account-notes.ts";

/** The routes that start, change and remove a setup record. */
export interface GoogleSetupWriteRoutes {
  start(request: Request, body: Uint8Array): Promise<Response>;
  edit(request: Request, body: Uint8Array, accountRef: string): Promise<Response>;
  startOver(request: Request, accountRef: string): Promise<Response>;
}

const accountTypes: readonly AccountType[] = ["workspace", "personal"];
const stepIds: readonly StepId[] = [
  "project",
  "apis",
  "consent",
  "scopes",
  "client",
  "credentials",
  "sign-in",
];

/** The longest project ID or client ID a request may carry; Google's own are far shorter. */
const maxIdLength = 256;

type Fields = Readonly<Record<string, unknown>>;

/** The body as an object, or `null` when it isn't JSON or isn't an object. */
function readObject(body: Uint8Array): Fields | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Fields;
}

function isAccountType(value: unknown): value is AccountType {
  return accountTypes.some((type) => type === value);
}

function isStepId(value: unknown): value is StepId {
  return stepIds.some((id) => id === value);
}

function readConnector(value: unknown): ConnectorLink | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { workspace, id } = value as Fields;
  return typeof workspace === "string" && typeof id === "string" ? { workspace, id } : null;
}

/** A text of 1 to {@link maxIdLength} characters, or `null`. */
function readId(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= maxIdLength
    ? value
    : null;
}

/** The project ID edit for a value: an ID, or `null` to clear it. */
function readProjectIdEdit(projectId: unknown): SetupEdit | null {
  if (projectId === null) {
    return { kind: "project-id", projectId: null };
  }
  const valid = readId(projectId);
  return valid === null ? null : { kind: "project-id", projectId: valid };
}

/**
 * The edit a body names, or `null`. Only the changes a person makes are
 * accepted. The ones the host itself records (sign-in, client secret,
 * service checks) are not: a request must not be able to say it signed in.
 */
function readEdit(fields: Fields): SetupEdit | null {
  switch (fields["kind"]) {
    case "account-type":
      return isAccountType(fields["accountType"])
        ? { kind: "account-type", accountType: fields["accountType"] }
        : null;
    case "project-id":
      return readProjectIdEdit(fields["projectId"]);
    case "step-done":
    case "step-reopened":
      return isStepId(fields["step"]) ? { kind: fields["kind"], step: fields["step"] } : null;
    case "in-production":
      return typeof fields["ticked"] === "boolean"
        ? { kind: "in-production", ticked: fields["ticked"] }
        : null;
    case "address-changed":
      return { kind: "address-changed" };
    case "client-id": {
      const clientId = readId(fields["clientId"]);
      return clientId === null ? null : { kind: "client-id", clientId };
    }
    default:
      return null;
  }
}

/** The start, edit and start-over routes of the Google setup. */
export function createGoogleSetupWriteRoutes({
  google,
  wrongAccountNotes,
}: {
  readonly google: GoogleSetupPorts;
  readonly wrongAccountNotes: WrongAccountNotes;
}): GoogleSetupWriteRoutes {
  const { setups } = google;

  /**
   * The write that runs last. Each write waits for it, so a start never reads
   * "no record" while another start or a start over is still writing.
   */
  let lastWrite: Promise<unknown> = Promise.resolve();

  /** Runs `write` after every write before it has finished, whether it failed or not. */
  function oneAtATime<Result>(write: () => Promise<Result>): Promise<Result> {
    const result = lastWrite.then(write, write);
    lastWrite = result.catch(() => undefined);
    return result;
  }

  /**
   * `POST /api/google/setups` with `{ accountType, connector: { workspace, id } }`:
   * starts a record for that connector and answers 201 with its `accountRef`.
   * A connector that already has a record keeps it: the answer is 200 with
   * that record's `accountRef` and nothing is written, so two quick starts
   * make one record, even when they arrive together: writes run one at a
   * time. The connector link is how a record finds its Inbox item, so a link
   * that breaks the name rules is a 400 and nothing is written.
   */
  async function start(request: Request, body: Uint8Array): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const fields = readObject(body);
    const connector = fields === null ? null : readConnector(fields["connector"]);
    if (fields === null || connector === null || !isAccountType(fields["accountType"])) {
      return errorResponse(serverErrors.badRequest);
    }
    const accountType = fields["accountType"];
    try {
      return await oneAtATime(async () => {
        const existing = await setups.forConnector(connector.workspace, connector.id);
        if (existing !== null) {
          return Response.json({ accountRef: existing.accountRef });
        }
        const record = await setups.start({
          route: { app: "own", runsOn: "this-computer" },
          accountType,
          connector,
        });
        return Response.json({ accountRef: record.accountRef }, { status: 201 });
      });
    } catch (error) {
      if (error instanceof SetupRecordError && error.reason === "refused") {
        return errorResponse(serverErrors.badRequest);
      }
      throw error;
    }
  }

  /** Saves an edit, and forgets what the host keeps in memory that the edit makes untrue. */
  async function applyEdit(accountRef: string, change: SetupEdit): Promise<void> {
    await setups.update(accountRef, change);
    if (change.kind === "address-changed") {
      // The note holds the other account's address, which no longer applies.
      wrongAccountNotes.clear(accountRef);
    }
  }

  /**
   * `PATCH /api/google/setups/<ref>` with one edit, see {@link readEdit}:
   * applies it and answers `{ updated: true }`. The record is checked before
   * it is written, so an edit that would break it is a 400.
   */
  async function edit(request: Request, body: Uint8Array, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    const fields = readObject(body);
    const change = fields === null ? null : readEdit(fields);
    if (change === null) {
      return errorResponse(serverErrors.badRequest);
    }
    if ((await readSetup(setups, accountRef)) === null) {
      return errorResponse(serverErrors.googleSetupNotFound);
    }
    try {
      await applyEdit(accountRef, change);
      return Response.json({ updated: true });
    } catch (error) {
      if (error instanceof SetupRecordError && error.reason === "refused") {
        return errorResponse(serverErrors.badRequest);
      }
      throw error;
    }
  }

  /**
   * `POST /api/google/setups/<ref>/start-over`: removes the record, the
   * refresh token and the client secret (not while another account uses the
   * client), without asking Google, and starts a fresh record for the same
   * connector and account type in the same step. It runs between other
   * writes, so a start can't add a second record in the middle. If the fresh
   * record can't be started after the removal, the connector is left with no
   * record and the error goes to the caller. Answers `{ clientSecret, accountRef }` with what happened
   * to the secret and the fresh record's ref. `disconnect` is the route that
   * also revokes.
   */
  async function startOverRoute(request: Request, accountRef: string): Promise<Response> {
    const refusal = refuseOtherSite(request);
    if (refusal !== null) {
      return errorResponse(refusal);
    }
    return oneAtATime(async () => {
      const old = await readSetup(setups, accountRef);
      if (old === null) {
        return errorResponse(serverErrors.googleSetupNotFound);
      }
      const secret = await startOver(
        { setups, secrets: google.clientSecrets, tokens: google.tokens },
        accountRef,
      );
      const fresh = await setups.start({
        route: old.route,
        accountType: old.accountType,
        connector: old.connector,
      });
      return Response.json({ clientSecret: secret, accountRef: fresh.accountRef });
    });
  }

  return { start, edit, startOver: startOverRoute };
}
