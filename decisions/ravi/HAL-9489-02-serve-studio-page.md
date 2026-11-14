# Decision: `halonic serve` serves the Studio page

- Task: HAL-9489
- Approval: Liam's decision on HAL-9482 (served Studio and its page route); Priya reviews the security side, Liam reviews the code and signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6Qu8xXydMAltGRjHKjNdAxRi2aMTKCJ1AEZgMDzpH3JAH7u+SqRvB6cYQLKQ1RKdUx4pxaKDEs/q0KJXpbaWCg==

## What changes

`halonic serve` now shows a page in the browser. Opening the address it prints shows the built Studio page at `/`, where before the address answered the API only and left a browser or the Android app nothing to open.

- The page comes from a new page route of the server. It answers `GET` and `HEAD` for the page's own files, without a sign-in, because the files are the same for everyone and hold nothing of the workspace. The page shows its own sign-in.
- The API routes keep precedence. Every `/api` path keeps its own answer, whatever file the build holds, and an unknown `/api/…` path still answers 404.
- Only page files carry their own content security policy: the page runs only its own scripts and styles, calls only this server and can't be framed. Every other response keeps `default-src 'none'; frame-ancestors 'none'`, and every other security header stays as it was on page files too.
- The command reads the page from `apps/studio/dist/studio`, where `pnpm --filter @halonicjs/app-studio build` leaves it. It keeps no copy and has no build step of its own. When the page isn't built, the API is still served, `/` answers 404, and a third line tells the user how to build it.

## Why

The served Studio is approved on HAL-9482. Without a page route, `halonic serve` has nothing for a browser to open. Reading the build folder in place avoids a copy step that could go stale. A per-route policy lets the page run while nothing else gets looser, and a path filter plus the folder reader's real-path check keep every request inside the build folder.

## Covers

- cli.commands.serve.serve
- server.api
- server.response-headers
