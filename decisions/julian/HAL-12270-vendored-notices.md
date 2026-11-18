# Decision: a vendored file can name its own licence text

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12270
- Kind: internal

`pnpm check:sbom --notices` printed one shared text per licence
(`tooling/check/licence-texts/<SPDX ID>.txt`) for every vendored file, so a
second vendored MIT file from another author would show the first author's
copyright line, and MIT requires each copyright notice to be kept. A
`vendored` entry in `licences.json` can now name its own text with `text`;
without it the shared SPDX file stays the default. `check:licences` fails when
the named file is missing or outside `licence-texts/`. Tests cover two MIT
authors, and `docs/guides/checks.md` says when to add a `text`.

## Covers

- tooling/check/
- check.licences-vendored
