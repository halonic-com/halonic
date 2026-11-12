# @halonicjs/adapter-password-pbkdf2

The `PasswordHasher` port for cloud targets: chained PBKDF2-SHA256 from Web Crypto, six runs of
100,000 rounds, each run's output being the next run's input
(Julian's HAL-136 decision, written down as
[`ports.password-hash-format-pbkdf2-chain`](../../core/ports/requirements/password-hash-format-pbkdf2-chain.md)). A Worker can't run scrypt at safe settings, so
cloud targets use this format and `serve` keeps scrypt. `halonic deploy` makes the hash on your
machine with this package, and the Worker checks it with the same code.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** any (Node and workerd)
- **Public API:** `@halonicjs/adapter-password-pbkdf2`

## Use

```ts
import { createPbkdf2ChainHasher } from "@halonicjs/adapter-password-pbkdf2";

const hasher = createPbkdf2ChainHasher();
const stored = await hasher.hash("a long made-up password");
// $pbkdf2-sha256-chain$i=100000,n=6$<16-byte salt>$<32-byte hash>
await hasher.verify("a long made-up password", stored); // true
```

- The stored text is `ports.password-hash-format-pbkdf2-chain`. `verify` refuses, with a
  `RangeError` and before any PBKDF2 work, a hash in another format, a malformed one, and settings
  other than `i=100000` and `n` 6 to 20. It compares in constant time.
- Each check costs about 65 ms of CPU (Julian budgets up to 200 ms on Cloudflare). The caller
  checks the request size and the login limit first, so wrong guesses can't burn that CPU.
- `needsRehash` is `true` for any `n` but 6; the hash is a configured secret, so it is replaced by
  setting the password again with `halonic deploy`.
