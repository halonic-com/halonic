# @halonicjs/google-setup

The rules of the Google setup flow in Studio's Inbox, as pure logic over the ports. For now: the
client secret store with staged replace, its token names, the `GOCSPX-` detector, the step
generator, the saved setup progress and the checks after sign-in. The error classification
follows.

- **Layer:** core
- **Owner:** priya
- **Public API:** `@halonicjs/google-setup`

## Example

Start a setup record for a made-up `acme` connection, give each of its services one result of the
checks after sign-in, and print what the record kept. The code lives in
[`examples/check-an-acme-setup.ts`](examples/check-an-acme-setup.ts), where it is typechecked and
run by `src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`,
because a package may not import itself by name; outside this package, import
`@halonicjs/google-setup` as below. Nothing in it touches the network or holds a real client ID.

```ts
import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { fixedClock, fixedIds } from "@halonicjs/std";
import {
  readGoogleCheckAnswer,
  type ServiceCheckOutcome,
  type SetupService,
  serviceScopes,
  setupRecords,
} from "@halonicjs/google-setup";

/** A made-up service of the made-up `acme` connection; the check is a GET on its API. */
function acme(name: string, check: boolean): SetupService {
  const scope = `https://www.googleapis.com/auth/acme.${name}`;
  return {
    id: `acme-${name}`,
    label: `Acme ${name}`,
    googleApis: [{ api: `acme${name}.googleapis.com`, name: `Acme ${name} API` }],
    googleScopes: [{ scope, reason: `Reads your Acme ${name}` }],
    ...(check
      ? { googleCheck: { method: "GET", url: `https://acme${name}.googleapis.com/v1/me` } }
      : {}),
  };
}

/** A record store in memory. On a server this is the real one, which agents can't write to. */
function memoryRecords(): RecordStore {
  const log: RecordChange[] = [];
  return {
    append: async (changes) => void log.push(...changes),
    changes: async (collection) => log.filter((change) => change.collection === collection),
    compact: async (collection) => {
      const rest = log.filter((change) => change.collection !== collection);
      const kept = compactedChanges(
        collection,
        log.filter((change) => change.collection === collection),
      );
      log.splice(0, log.length, ...rest, ...kept);
    },
  };
}

/** Records one result of each check kind for an `acme` setup and prints one line per service. */
export async function runExample(): Promise<string[]> {
  const services = [
    acme("calendar", true), // Google answers 200
    acme("notes", false), // no check in the sheet
    acme("files", true), // the user unticked its scope
    acme("mail", true), // Google says the API is off
    acme("sheets", true), // Google says slow down
    acme("maps", true), // no answer at all
  ];
  const projectId = "acme-demo-1";

  const setups = setupRecords({ records: memoryRecords(), clock: fixedClock(), ids: fixedIds() });
  const { accountRef } = await setups.start({
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
  });

  // What Google's token answer granted: everything except the files scope.
  const granted = services
    .filter((service) => service.id !== "acme-files")
    .flatMap((service) => service.googleScopes.map(({ scope }) => scope));
  const missing = new Map(
    serviceScopes(services, granted).map((scopes) => [scopes.service, scopes]),
  );

  // What the checks got back, by service. A missing entry means the request failed.
  const answers = new Map([
    ["acme-calendar", { status: 200, json: {} }],
    [
      "acme-mail",
      {
        status: 403,
        json: {
          error: {
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                reason: "SERVICE_DISABLED",
                metadata: { service: "acmemail.googleapis.com" },
              },
            ],
          },
        },
      },
    ],
    [
      "acme-sheets",
      { status: 429, json: { error: { errors: [{ reason: "rateLimitExceeded" }] } } },
    ],
  ]);

  for (const service of services) {
    const scopes = missing.get(service.id);
    const answer = answers.get(service.id);
    let result: ServiceCheckOutcome;
    if (scopes !== undefined && !scopes.granted) {
      result = { kind: "scopeNotGranted", missingScopes: scopes.missingScopes };
    } else if (service.googleCheck === undefined) {
      result = { kind: "allowed" }; // every scope was granted, but nothing showed the API is on
    } else if (answer === undefined) {
      result = { kind: "unreachable" };
    } else {
      result = readGoogleCheckAnswer(answer, service, projectId);
    }
    await setups.update(accountRef, { kind: "service-checked", service: service.id, result });
  }

  // The record keeps each result; no result holds a token or any of Google's free text.
  const record = await setups.read(accountRef);
  return Object.entries(record?.services ?? {}).map(([id, { result }]) => {
    const link = result.kind === "apiOff" ? ` (enable it at ${result.enableUrl})` : "";
    return `${id}: ${result.kind}${link}`;
  });
}
```

It prints one line per service, in order: `works`, `allowed`, `scopeNotGranted`, `apiOff` with the
link to switch the API on, `checkFailed` and `unreachable`.

## The client secret store

```ts
import { clientSecretStore, looksLikeGoogleClientSecret } from "@halonicjs/google-setup";

const secrets = clientSecretStore(tokens, ids);
const clientRef = await secrets.saveClientSecret(pasted); // only the ref comes back

// Replacing a rotated secret after the first sign-in:
await secrets.stageClientSecret(clientRef, pastedAgain);
// ...refresh a token with secrets.readStagedClientSecret(clientRef)...
await secrets.promote(clientRef); // Google accepted it
await secrets.discard(clientRef); // or: Google refused it, the old one stays

looksLikeGoogleClientSecret(clientIdField); // clear a client ID field that holds the secret (C3)
```

Notes and chat messages (C6) don't use `looksLikeGoogleClientSecret`. They hold a message with
`findSecretShape` from `@halonicjs/std`, the check the Assistant and Try it share, so all three spot
the same formats. Its `google-client-secret` answer tells Studio to point to the client secret field.
`looksLikeGoogleClientSecret` stays for the client ID field, where a cut-short paste such as
`GOCSPX-a` must also be caught.

## Setup steps

`setupSteps(input)` turns the route, the account type and the ticked services' sheet fields
(`googleApis`, `googleScopes`, `googleCheck`) into the steps of design 3.2. It returns ids, values
and links; Studio owns the sentences. Nothing in it names a service: everything service-specific
comes from the sheets.

| Id            | Step                 | Carries                                                         |
| ------------- | -------------------- | --------------------------------------------------------------- |
| `project`     | Google Cloud project | New project link, `halonic`, Workspace: inside the organisation |
| `apis`        | Switch on the APIs   | one row per API with its Enable link; Switch on all for 2+      |
| `consent`     | Consent screen       | app name and e-mails; personal: External and `in-production`    |
| `scopes`      | Scopes (D4 switch)   | one row per scope with each service's reason, Copy all scopes   |
| `client`      | Create the client    | `Halonic desktop`; done when step 6 saves a client ID           |
| `credentials` | Client ID and secret | Clients link, for a lost secret                                 |
| `sign-in`     | Sign in with Google  | scopes to grant, one check per service, admin note or warning   |

Progress keys ticks by id, so `listScopes: false` renumbers the steps without moving any tick.
Links open in the project only when its ID is valid; otherwise `projectIdIgnored` is true.

## When the services change

`compareSetups(before, after)` matches the steps by id and marks each one `unchanged`, `lost-only`
(an unticked service's rows went away; nothing to do) or `reopened` (new rows, which Studio marks
"New", or a changed value such as the account type). Step 7 reopens for every new scope or service,
even with step 4 switched off. `ticksToKeep(changes, ticks)` gives the ticks that stay.

## Setup progress

`setupRecords({ records, clock, ids })` keeps one record per Google account in the record store
collection `_google_setups`, under a random account ref (`gaccount_…`), never an e-mail address
(design 3.6, plan D5). The e-mail address stays in the connector settings.

```ts
const setups = setupRecords({ records, clock, ids });
const { accountRef } = await setups.start({ route, accountType: "personal" });
await setups.update(accountRef, { kind: "step-done", step: "project" });
await setups.update(accountRef, { kind: "client-secret-saved", clientRef }); // the ref only
```

| Value                  | Holds                                                   |
| ---------------------- | ------------------------------------------------------- |
| `route`, `accountType` | the two answers the item asks first                     |
| `startedAt`            | for "You started this on 8 Nov"                         |
| `projectId`            | step 1's project ID, if valid                           |
| `stepsDone`            | when each step was marked done, by step id              |
| `inProductionTickedAt` | the "In production" tick (personal, step 3)             |
| `clientId`             | the client ID from step 6                               |
| `clientSecret`         | the secret's `clientRef` and when it was saved          |
| `signInStartedAt`      | a sign-in that hasn't come back, for "didn't finish"    |
| `lastSignInAt`         | the last sign-in, for the 7-day hint                    |
| `services`             | per service: scope granted, last check result, and when |

Every change is a `SetupEdit` named after what happened, stamped by the clock. The record is checked
before every write and after every read, and refuses any other key, so it can't hold the client
secret, a refresh, access or ID token, the authorisation code, the PKCE `code_verifier` or the
`state`. A record that fails the check reads as `damaged`; errors never repeat a value.

**Sharing a client** (design 3.6, last bullet): `shareClient(accountRef, fromAccountRef)` lets a
personal account use another personal account's working app. Both records then hold the same
client ID and client secret ref, so a rotation is done once; `usingClient(clientRef)` lists them
for "Used by x and y" and for marking every account **Needs new secret**. It refuses an account
that already has its own client ID, client secret or sign-in, since sharing would leave that
secret with no record pointing to it; the user starts that setup over first.

**Start over**: `startOver({ setups, secrets, tokens }, accountRef)` removes the account's refresh
token and its record (compacting `_google_setups`), and the client secret unless another account
uses it. It returns which case it was, revokes nothing at Google, and removes the secrets before the
record, so a crash never leaves a secret no record points to, except for a damaged record: its
secret ref can't be trusted, so that secret stays. The stores keep no old value after
they compact, but backups and freed disk blocks are outside them, so Studio says "Halonic deletes
the saved client secret and stops using it" (plan D1), never that it is gone from the computer.

**Agents, tools and hubs must not be able to write to `_google_setups`**: the record decides which
client secret a sign-in uses. Only the host's setup routes (build plan B5) get the store.

## Token names

The secrets live in the `TokenStore` (encrypted, written by the server), not in `Secrets`, which is
read-only. Names follow the `Secrets` name rule, so they hold refs from the `IdGenerator`, never an
e-mail address or a client ID.

| Token                              | Holds                                       |
| ---------------------------------- | ------------------------------------------- |
| `google-client-<clientRef>`        | the client secret in use                    |
| `google-client-<clientRef>-staged` | a new client secret until Google accepts it |
| `google-account-<accountRef>`      | one Google account's refresh token          |

These are the only names of a Google client secret and refresh token. A connector file's `client`
and `secret` name no secret (`format.secret-names`): the setup record decides which client a sign-in
uses, and the account ref which refresh token.

The refresh token's name is set by plan D2. It can't clash with an integration's own tokens, which
the host stores as `i<n>_<integration>_<token>`. A ref that breaks the rule throws a `RangeError`
with a fixed message: the message never repeats the ref, because with swapped arguments it could
be a secret.

## Rules

- No call returns a secret except `readClientSecret` and `readStagedClientSecret`, and no error
  message holds one.
- **Only the host reads a client secret back.** `readClientSecret` and `readStagedClientSecret` are
  called only by the host's Google sign-in (build plan A2) and its token refresh and secret check
  (B4, B5). Studio, the kit, hubs and integrations never call them: an integration only ever gets
  an access token, through scoped tokens that can't reach `google-client-*`.
- Which accounts share a client ref is in the setup records, so `removeClientSecret` takes
  `usedByOthers` from the caller; `startOver` works it out with `usingClient`.
- Before the first sign-in there is nothing to test a new secret with, so the caller uses
  `replaceClientSecret` instead of staging.

## Sign-in (HAL-699)

The pure parts of the Google sign-in round trip. The host package
`@halonicjs/host-google-sign-in` makes the PKCE pair and `state`, keeps the pending sign-ins and
talks to Google.

| Export                                      | What it does                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `googleAuthUrl`                             | the auth URL: code flow, PKCE S256, loopback redirect, `openid email` plus the services' scopes                                                                  |
| `loopbackRedirectUri`                       | `http://127.0.0.1:<port><path>`; refuses a query string, a fragment and anything unusual in the path                                                             |
| `PendingSignIns`                            | the port for pending sign-ins: `start` (one per account), `take(state)`, and `authUrlFor` and `cancel` for "Open again" and "Cancel"; in memory only, 10 minutes |
| `readSignInCallback`                        | reads the callback: finds the sign-in by `state` first, then maps `error` or returns the code                                                                    |
| `classifyTokenAnswer`                       | what Google's token answer means: `wrongClientSecret`, `codeRefused`, `noRefreshToken` and so on                                                                 |
| `signInScopes`                              | the scopes to ask for: `baseSignInScopes` (`openid`, `email`) and the services' scopes, sorted, without duplicates                                               |
| `googleAuthEndpoint`, `googleTokenEndpoint` | Google's authorisation and token endpoints, as constants                                                                                                         |

A pending sign-in holds the PKCE verifier, so it is never written to the `TokenStore` or any other
store (plan D5). The `code` and `tokens` results hold secrets and never leave the host package.
Google's `error_description` is never read, and an `error` value that isn't a plain code becomes
`unrecognised`.

## Checks after sign-in (HAL-708)

The pure parts of setup items 6 and 7. The host's sign-in runs them inside `finishGoogleSignIn`,
before it saves anything and while it still holds the fresh access token.

| Export                   | What it does                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `accountMatches`         | whether the verified address is the connector's: trimmed, any letter case, no dot or `+` folding                      |
| `serviceScopes`          | per service, whether Google granted all its `googleScopes`, or which are missing                                      |
| `readGoogleCheckAnswer`  | one `googleCheck` answer as `works` (2xx), `apiOff` (403 that says so) or `checkFailed`                               |
| `ServiceCheckOutcome`    | what step 7 shows per service: those three, `allowed`, `scopeNotGranted` and `unreachable`                            |
| `accountTypeFromAddress` | `personal` for a Gmail or Googlemail address, otherwise `undefined`: the address alone can't tell a Workspace account |
| `isApiHost`              | whether text has the `<name>.googleapis.com` shape, the only API host a result keeps                                  |

`allowed` means every scope was granted and the sheet has no `googleCheck`: nothing showed the API
is on. `apiOff` keeps the API host only in the `<name>.googleapis.com` shape, its name only from the
service's sheet, and the project ID from the setup or else Google's project number. No result keeps
Google's `message` or any other free text, so every result can be shown, logged and saved. The
setup record keeps each service's last `ServiceCheckOutcome` and its time (plan D5 revision 5); its
strict schema checks every field again, and an `apiOff` link must be the one `enableApiUrl` makes.

## Refused refreshes and the connector's state

When a token refresh is refused, a run must not ask Google again.

- `readRefreshAnswer(answer)` reads Google's answer to a refresh as `refreshed`, `signInRefused`
  (`invalid_grant`), `clientRefused` (`invalid_client`), `googleError` or `unexpectedAnswer`. It never
  reads `error_description`, so only `refreshed` holds a token.
- `setups.refreshRefused(accountRef, refusal)` saves the refusal in the record: a fixed reason
  (`client`, `sign-in` or `client-gone`) and the time. A `client` refusal marks every account on that
  client in one write. A later refusal never moves an account to a reason that needs less to fix.
  `mayRefresh(record)` is `false` for a refused record, so there is no retry loop. Only a new sign-in
  clears a refusal, never the passing of time. `setups.clientSecretAccepted(clientRef)` clears only a
  `client` refusal; a `sign-in` or `client-gone` refusal stays.
- `connectorState(record, problem, now)` turns a refusal, or an API switched off during a run
  (`ApiDisabled`), into the badge: **Needs sign-in again**, **Needs new secret** or **API off**, each
  with the steps the setup item reopens at. A personal account without the "In production" tick
  that is refused 6½ to 7½ days after its last sign-in (`testingHintWindowMs`) also gets the
  Testing hint first. `savedConnectorState(record)` brings the badge back after a restart, or gives
  `null` when nothing is saved.

## Errors

`SetupRecordError` and `ClientSecretError` keep their detailed `reason` and carry a coarse `kind` that
`errorKindOf` from `@halonicjs/std` reads:

| Error               | Reason           | Kind            |
| ------------------- | ---------------- | --------------- |
| `SetupRecordError`  | `not-found`      | `not_found`     |
|                     | `refused`        | `invalid_input` |
|                     | `cannot-share`   | `conflict`      |
|                     | `damaged`        | `internal`      |
| `ClientSecretError` | `empty`          | `invalid_input` |
|                     | `not-saved`      | `not_found`     |
|                     | `nothing-staged` | `conflict`      |

Besides the calls shown above, `setups` also has `read`, `list`, `usingClient` and `remove`.
