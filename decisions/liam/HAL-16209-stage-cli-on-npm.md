# Decision: the release run stages the halonic CLI on npm

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16209 (Chief asked Liam to decide how `halonic` gets to npm, for HAL-16207); Julian signs it, as Liam wrote the pull request
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:Pqi1Q/ewt69Tz2gG6KMQLuKYlzbngoDkf3tmBMXZay44Bf7pbBBK39yv5VAZgp2LmgHhQ4v9yqxIR51eBFeADQ==

`release.yml` gets an `npm-cli` job. On a real `v*` tag run, after the draft release exists, it
takes the `cli-package` tarball the build job installed and ran, and stages it on npm as
`halonic` with `--tag latest`, through npm's trusted publisher (no npm token). It runs in the
`npm-publish-cli` environment, which only `v*` tags may use. The version stays staged until the
board approves it on npmjs.com with 2FA. Dry runs skip the job. Nothing else in the release run
changes, and no check or trust root is touched.

## Why

The release run built the CLI package for "the later npm publish step", but no workflow
published it, so a `v0.1.1` run would have left `halonic` with only the empty placeholder on
npm. Staging it from the tag's own run keeps the provenance on that run and the bytes the ones
the build job checked, with the board's 2FA approval as the release gate, like the kit packages.

## Covers

- .github/
