# studio.assistant-read-docs

- Status: active
- Since: unreleased
- Source: HAL-18451 (I4b PR 2b, plan rev 2 on HAL-18271, sections 2.1 to 2.3); `assistant.build.read-docs` (HAL-18398); the shell's `publicOnly` (HAL-18450)

The folder's Assistant shall give a Build chat `read_docs` only where it runs in the shell, fetching with the shell's client for public addresses only (`publicOnly`), with no keys, on the page's own timers. A turn shall offer `read_docs` only while the workspace is trusted, so a turn before trust still offers exactly the six authoring tools (`studio.assistant-authoring-turn`). Each chat's site answers and docs log shall be kept with the chat in the profile, never in the workspace, so no workspace file can allow a site; each log line shall name the `read_docs` call it is for. They shall come back when the chat is read again after Halonic restarts, and a new chat shall start with none, so it asks again. The person's answer on a site card shall change only the site that card's call asked about, and only while it waits: **Allow** shall record `allowed`, so the next `read_docs` for that host fetches, and **Don't allow** shall record `declined`, so it doesn't; an answered card shall be refused as `conflict`, and a card the chat doesn't have as `not_found`.

## Examples

- Given an untrusted workspace and a Build chat on the Settings › Assistant model,
  when it answers,
  then the turn offers the six authoring tools and no `read_docs`; once the workspace is trusted, the turn offers `read_docs`.
- Given a trusted chat whose model calls `read_docs` for `https://docs.example.com/api` as call `d1`,
  when it answers,
  then nothing is fetched and the chat's sites hold `docs.example.com` as `asked` with card `d1`; after **Allow** on that card, the next call fetches the page once.
- Given that chat after Halonic restarts,
  when it is read again,
  then its sites and log are the same, and a new chat asks about `docs.example.com` again.
- Given a new chat where the person chose **Don't allow**,
  when the model calls `read_docs` for that site again,
  then nothing is fetched, the result says the person didn't allow it, and answering the card again is refused as `conflict`.
