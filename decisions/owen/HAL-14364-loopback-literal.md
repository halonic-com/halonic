# Decision: only `localhost` and loopback addresses written as numbers make an `http` connector local

- Approval: Paperclip task HAL-14364; a security change, so Liam reviews and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DK8SmtyCkyf5Jgx8wUR4Hnb976KQojRu2aS24R8nSsO2q/1is1nvRsrTZwjG3g5yi5birRsnERyGbApFFsJUAQ==

## What changes

Without a `local` key, an `http` connector counted as local when its host was `localhost`, a
`*.localhost` name, `::1`, or any host starting with `127.`. The connection itself
(`connectorHostClass` in `http-kit`) reads hosts more narrowly: an address written as numbers goes
to its own class, `localhost` to this computer, and any other name to the internet. This change
makes the two rules the same.

Now only `localhost`, `::1` and an IPv4 address in `127.0.0.0/8` written as four decimal numbers
count as local. Every other name, `*.localhost` included, counts as outside. Shorter spellings such
as `127.1` count as outside too, which is the safe side.

## What a user sees

A workspace with `privacy.localOnly: true` and a connector whose URL is a `*.localhost` name or a
name starting with `127.` now gets the local-only refusal for it in `halonic validate`, `halonic
run` and Studio's connector status. Setting `local: true` on the connector still works for a server
that really runs on this computer.

## Covers

- format.connector-is-local
