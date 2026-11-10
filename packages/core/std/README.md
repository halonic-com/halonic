# @halonicjs/std

In-house utilities that replace generic libraries: result type, ids, clock, UTF-8, base64url, text helpers, deep equality and clone, posix paths, constant-time comparison, a typed event emitter, error kinds, a per-key work queue and semver versions.

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/std`

The core has no access to the platform, so anything that needs the outside
world comes in as a parameter: the time through a `Clock`, randomness through
a `RandomBytes` function. Tests pass `fixedClock()` and `fixedIds()` and get
the same output on every run.

Hashing is not here. SHA-256 comes from WebCrypto through a port, and the
password hash from `@noble/hashes` in the package that implements
`PasswordHasher`. What stays is the part the core can't reach otherwise:
`encodeUtf8` and `decodeUtf8` replace `TextEncoder` and `TextDecoder`, and
`constantTimeEqual` compares hashes and tokens without leaking where they
differ. Never compare those with `===`.
`encodeBase64url` and `decodeBase64url` stand in for `Buffer`'s `base64url`;
the decoder is strict, so each byte string has exactly one text.

For plain data there are `deepEqual` (key order doesn't matter),
`deepClone` (the core has no `structuredClone`), `canonicalJson` (one JSON text per
value, for hashing) and `isPlainObject`, which
tells a plain record apart from a `Date`, a `Map` or a class instance. `describeObject` and `keyPath` word the errors
about data that isn't plain, so they say what and where. `slugify` and `uniqueName`
turn display names into file-safe ids, as the old Studio did. `posixPath`
joins and cleans forward-slash paths like `node:path.posix`, `Emitter` is a
small typed event emitter, and `KeyedQueue` runs async work one at a time
per key, such as the appends to one run's log.
`readVersion`, `compareVersions` and `isAtLeast` read and order semver
versions, pre-releases included, such as the version a harness's program
prints (`0.169.0-alpha.6` comes before `0.169.0`).
`asciiHost` writes a host name the way the trust prompt shows and hashes it:
lowercase, with non-ASCII labels in Punycode (`xn--…`), so a look-alike host
never passes for the real one.

Errors a person can see carry one of eight kinds (`ErrorKind`): `invalid_input`,
`not_found`, `conflict`, `unauthenticated`, `denied`, `limit_reached`,
`unavailable` and `internal`. Throw a `KindedError`, or give an existing error
class a `kind` property. A `KindedError` can also carry a `fix`: the next step,
kept apart from the message so a surface can show it on its own line. Each surface (HTTP, CLI, Studio, MCP) reads the kind
with `errorKindOf` and turns it into its response in one exhaustive `switch`.
Anything without a kind is `internal`, so an unexpected error never shows
its own text to the user.

`findSecretShape` spots text shaped like an API key or other secret (`sk-`, `GOCSPX-`, `AIza`,
`ghp_`, `github_pat_`, `xoxb-`), so Studio can hold a message before it is sent, saved or logged.
It answers with the kind of secret only, never the text it found.
`SecretScrubber` is the other half: once told a secret value with `remember`, `scrub` replaces
it in any text, raw or URL-, form- or JSON-encoded, with `[secret removed]`. The CLI is meant to
pass every error it prints through one. `secretTextForms` lists those forms for code that matches
bytes instead.

Each behaviour has a requirement in [`requirements/`](requirements/).

## Example

Ids and a clock passed in, a result type, text helpers and the typed emitter. The code lives in
[`examples/ids-results-and-events.ts`](examples/ids-results-and-events.ts), where it is typechecked
and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/std` as below.

```ts
import {
  assert,
  deepEqual,
  Emitter,
  err,
  fixedClock,
  fixedIds,
  mapResult,
  ok,
  randomIds,
  slugify,
  uniqueName,
} from "@halonicjs/std";

/** Uses ids and a clock passed in, a result type, text helpers and the typed emitter. */
export function runExample(): {
  appId: string;
  testId: string;
  time: string;
  doubled: unknown;
  failed: unknown;
  names: string[];
  same: boolean;
  saved: string[];
} {
  // In an app: pass `(count) => crypto.getRandomValues(new Uint8Array(count))` and
  // `systemClock`. Here the bytes and the time are fixed, so the output is the same every run.
  const ids = randomIds((count) => new Uint8Array(count).fill(171), fixedClock());
  const appId = ids.next("run"); // "run_mjuohs00_abababab"

  // In a test: the same ids and times on every run.
  const testId = fixedIds().next("run"); // "run_1"
  const time = fixedClock().now().toISOString(); // "2026-01-01T00:00:00.000Z"

  assert(ok(1).ok, "ok() always succeeds");
  const doubled = mapResult(ok(21), (value) => value * 2); // { ok: true, value: 42 }
  const failed = mapResult(err("no file"), (value: number) => value * 2); // { ok: false, error: "no file" }

  // File-safe names from display names.
  const taken = ["weekly-report"];
  const names = [slugify("Weekly Report"), uniqueName("weekly-report", taken)]; // ["weekly-report", "weekly-report-2"]

  // Key order doesn't matter.
  const same = deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }); // true

  // A typed event emitter: the payload type follows the event name.
  const changes = new Emitter<{ saved: { path: string } }>();
  const saved: string[] = [];
  const stop = changes.on("saved", ({ path }) => saved.push(path));
  changes.emit("saved", { path: "hubs/support/hub.yaml" });
  stop();
  changes.emit("saved", { path: "ignored.yaml" }); // nobody is listening any more

  return { appId, testId, time, doubled, failed, names, same, saved };
}
```
