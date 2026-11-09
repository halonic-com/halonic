import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { fixedClock, fixedIds } from "@halonicjs/std";
import {
  readGoogleCheckAnswer,
  type ServiceCheckOutcome,
  type SetupService,
  serviceScopes,
  setupRecords,
} from "../src/index.ts";

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
