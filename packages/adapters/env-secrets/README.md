# @halonicjs/adapter-env-secrets

The `Secrets` port over `HALONIC_SECRET_<NAME>` environment variables, for the CLI and CI runners,
and `firstSecret`, which chains stores so the environment can come before the OS keychain.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-env-secrets`

## Names

A secret's variable is `HALONIC_SECRET_` and its name in upper case, with `-` as `_`:

| Secret name                                          | Variable                        |
| ---------------------------------------------------- | ------------------------------- |
| `serve-password`, `SERVE_PASSWORD`, `serve_password` | `HALONIC_SECRET_SERVE_PASSWORD` |
| `openai`                                             | `HALONIC_SECRET_OPENAI`         |

A name that breaks the port's rule (a letter, then letters, digits, `-` or `_`, at most 128
characters) is refused with a `RangeError` before any variable is read. An unset or empty variable
gives `null`.

**Nothing else is read.** Not the old `STUDIO_SECRET_` prefix, and not a provider's own variable
such as `OPENAI_API_KEY`: a key reaches Halonic only when someone configured it for Halonic. To use
a key you already have, set `HALONIC_SECRET_OPENAI` to it.

`secretVariableName(name)` gives the variable for a name (with the same `RangeError`), and
`secretVariablePrefix` is `HALONIC_SECRET_`. `EnvSecrets` takes an `Environment`, a read-only record
of variable names to `string | undefined`, which `process.env` fits.

The environment is passed in (the CLI passes `process.env`), so the adapter has no Node APIs and
tests never touch the real environment. It reads the variables live, so it sees a variable set after
it was made.

## Example

Read secrets the way the CLI does. The code lives in [`examples/cli-chain.ts`](examples/cli-chain.ts),
where it is typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file
imports `../src/index.ts`, because a package may not import itself by name; outside this package,
import `@halonicjs/adapter-env-secrets` as below. The memory secrets stand in for the OS keychain
reader, which comes later.

```ts
import { MemorySecrets } from "@halonicjs/adapter-memory";
import { EnvSecrets, firstSecret } from "@halonicjs/adapter-env-secrets";

/** Reads secrets the way the CLI does: the environment first, then the keychain. */
export async function runExample(): Promise<{
  fromEnvironment: string | null;
  fromKeychain: string | null;
  notConfigured: string | null;
}> {
  // The CLI passes `process.env`; an invented environment keeps the example repeatable.
  const env = new EnvSecrets({
    HALONIC_SECRET_OPENAI: "env-value", // a made-up value; never print a real one
    OPENAI_API_KEY: "ignored", // a provider's own variable is never read
  });
  // A stand-in for the OS keychain reader, which isn't there on a CI runner.
  const keychain = new MemorySecrets({ openai: "keychain-value", anthropic: "keychain-value" });

  const secrets = firstSecret(env, keychain);

  const fromEnvironment = await secrets.get("openai"); // "env-value": the environment wins
  const fromKeychain = await secrets.get("anthropic"); // "keychain-value"
  const notConfigured = await secrets.get("google"); // null

  return { fromEnvironment, fromKeychain, notConfigured };
}
```

## Chaining stores

`firstSecret(first, ...rest)` asks each store in order and gives the first value that isn't `null`.
It needs at least one store, so a bad name is always refused. A store that throws stops the search
and its error reaches the caller unchanged: a locked keychain is a problem to report, not a missing
secret.

## Limits

- **Values never appear in errors or logs.** An error names the secret only when the port allows it (a short printable name, never something that
  may be a value passed by mistake), and the package doesn't log.
  Whoever calls `get` must keep it that way.
- **Exact upper case.** On Linux and macOS variable names are case-sensitive, so
  `halonic_secret_openai` is not read.
