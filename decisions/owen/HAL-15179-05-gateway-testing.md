# Decision: register the ./testing entry of the remote gateway and the ./phone-client entry of the remote feature

- Approval: Paperclip task HAL-15179 (Liam agreed to the `./testing` entry there on 21 Nov); Liam approves this note in review
- Kind: internal

The interop test in `packages/testing/integration` runs the phone's gateway client against the real remote
gateway, so it needs two new subpaths, both registered in `extraExports` of `tooling/check/policy.json`, which
is the only change to that file.

- `@halonicjs/adapter-remote-gateway` gets `./testing`, which re-exports the gateway's own test phone, fake
  pairing, fake source and listener helpers. The package is private, and `adapters/git`,
  `cloudflare-durable` and `core/engine` already have the same kind of entry.
- `@halonicjs/studio-feature-remote` gets `./phone-client`, the gateway client and its view without the phone
  screens. `./phone` also exports `.tsx` screens, which a plain Node package can't typecheck. A test keeps
  React, the kit and `.tsx` files out of everything `./phone-client` reaches. `./phone` exports the same
  names as before.

## Covers

- tooling/check/policy.json
