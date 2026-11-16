import type { SetupRecord, SetupService } from "@halonicjs/google-setup";
import { parse, s } from "@halonicjs/schema-kit";
import type {
  CheckAgainAnswer,
  DisconnectAnswer,
  GoogleSetupAccount,
  GoogleSetupAccounts,
  SecretEntry,
  SecretReplaceAnswer,
  SignInEntry,
} from "@halonicjs/studio-feature-google-setup/api";
import type { SecretText } from "@halonicjs/studio-kit";
import { googleAccountOf } from "./google-account.ts";

/** Says why a change is refused: this window only reads the setups. */
const readOnly =
  "This window can only read the Google setup. Finish it on the computer running Halonic.";

/** The client secret can't be typed in a served window, so there is no field and no command. */
const noSecretField: SecretEntry = {
  kind: "unavailable",
  reason: "no-password",
  commandExists: false,
};

/**
 * One entry of `GET /api/google/setups`. The nested parts (check results, refusals, services) are
 * the computer's own answer to the page's own session, so they are passed on as they come.
 */
const setupSchema = s.object({
  accountRef: s.string(),
  account: s.string(),
  available: s.array(s.unknown()),
  route: s.unknown(),
  accountType: s.enum(["workspace", "personal"]),
  startedAt: s.string(),
  projectId: s.string().nullable(),
  stepsDone: s.record(s.string(), s.string()),
  inProductionTickedAt: s.string().nullable(),
  clientId: s.string().nullable(),
  clientSecretSavedAt: s.string().nullable(),
  signInStartedAt: s.string().nullable(),
  lastSignInAt: s.string().nullable(),
  wrongAccountAt: s.string().nullable(),
  lastSignInEnded: s.unknown(),
  refreshRefused: s.unknown(),
  services: s.record(s.string(), s.unknown()),
});

const listSchema = s.object({
  signIn: s.enum(["here", "elsewhere"]),
  setups: s.array(setupSchema),
});

type Listed = ReturnType<typeof listed>;

function listed(answer: unknown) {
  const parsed = parse(listSchema, answer);
  if (!parsed.ok) throw new Error("The computer's /api/google/setups answer isn't a setup list.");
  return parsed.value;
}

/**
 * The Google setups of the served workspace as a served Studio reads them
 * (`studio.served-google-setup-accounts`): `GET /api/google/setups` on the page's own address and
 * session. It only reads. Every change is refused in plain words, because the computer's Google
 * routes for a served window are read-only, and `signInEntry` is what the computer says about this
 * window: `elsewhere` for a window on another computer, which then shows the
 * `halonic google sign-in` command.
 *
 * The window reads the list once for `signInEntry`, since the view asks for it as a plain value.
 * It reads again when the window gets focus again, so a sign-in finished on the computer shows.
 */
export class ServedGoogleSetupAccounts implements GoogleSetupAccounts {
  readonly secretEntry = noSecretField;
  readonly readOnly = true as const;
  signInEntry: SignInEntry = { kind: "elsewhere", commandExists: true };
  readonly #fetch: (path: string) => Promise<Response>;
  readonly #onFocus: (listener: () => void) => () => void;

  /**
   * @param fetchPage reads a path on the page's own address
   * @param onFocus calls the listener whenever the window comes to the front; returns a function that stops it
   */
  constructor(
    fetchPage: (path: string) => Promise<Response>,
    onFocus: (listener: () => void) => () => void = () => () => {},
  ) {
    this.#fetch = fetchPage;
    this.#onFocus = onFocus;
  }

  async list(): Promise<readonly GoogleSetupAccount[]> {
    const response = await this.#fetch("/api/google/setups");
    if (!response.ok) {
      throw new Error(`The computer answered ${response.status} to /api/google/setups.`);
    }
    const answer: Listed = listed(await response.json());
    // Only `here` is trusted as a place the sign-in can run; anything else is the safe side.
    this.signInEntry =
      answer.signIn === "here" ? { kind: "here" } : { kind: "elsewhere", commandExists: true };
    return answer.setups.map((setup) =>
      googleAccountOf({
        email: setup.account,
        record: recordOf(setup),
        services: setup.available as SetupService[],
        clientSharedWith: [],
      }),
    );
  }

  edit(): Promise<void> {
    return Promise.reject(new Error(readOnly));
  }
  saveClientSecret(_ref: string, _secret: SecretText): Promise<void> {
    return Promise.reject(new Error(readOnly));
  }
  replaceClientSecret(_ref: string, _secret: SecretText): Promise<SecretReplaceAnswer> {
    return Promise.reject(new Error(readOnly));
  }
  startOver(): Promise<void> {
    return Promise.reject(new Error(readOnly));
  }
  disconnect(): Promise<DisconnectAnswer> {
    return Promise.reject(new Error(readOnly));
  }
  startSignIn(): Promise<string> {
    return Promise.reject(new Error(readOnly));
  }
  cancelSignIn(): Promise<void> {
    return Promise.reject(new Error(readOnly));
  }
  checkAgain(): Promise<CheckAgainAnswer> {
    return Promise.reject(new Error(readOnly));
  }
  wrongAccount(): Promise<string | null> {
    return Promise.reject(new Error(readOnly));
  }
  changeAddress(): Promise<void> {
    return Promise.reject(new Error(readOnly));
  }

  subscribe(listener: () => void): () => void {
    return this.#onFocus(listener);
  }
}

/** The record a served window draws from. Its link to the connector and its secret ref are never read. */
function recordOf(setup: Listed["setups"][number]): SetupRecord {
  return {
    accountRef: setup.accountRef,
    route: setup.route as SetupRecord["route"],
    accountType: setup.accountType,
    startedAt: setup.startedAt,
    connector: { workspace: "served", id: "served" },
    projectId: setup.projectId,
    stepsDone: setup.stepsDone as SetupRecord["stepsDone"],
    inProductionTickedAt: setup.inProductionTickedAt,
    clientId: setup.clientId,
    clientSecret:
      setup.clientSecretSavedAt === null
        ? null
        : { clientRef: setup.accountRef, savedAt: setup.clientSecretSavedAt },
    signInStartedAt: setup.signInStartedAt,
    lastSignInAt: setup.lastSignInAt,
    wrongAccountAt: setup.wrongAccountAt,
    lastSignInEnded: setup.lastSignInEnded as SetupRecord["lastSignInEnded"],
    services: setup.services as SetupRecord["services"],
    refreshRefused: setup.refreshRefused as SetupRecord["refreshRefused"],
  };
}
