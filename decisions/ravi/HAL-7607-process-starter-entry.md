# Decision: sandbox-mxc's SDK importer joins the process-starter list

- Approval: Paperclip task HAL-8806 (review of the process-starter entry, for HAL-7607)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yFHAvmkLzoKlLqDvesPXbgSD1Zr3lg1UtFLPpzbCoGtyr5hpKYcduDN0sejOwn2kz7sYqhm8vu3wEHgHisBeBA==

`tooling/check/process-starters.json` lists every file that may start a process or load code,
each with a reason and a test. This pull request adds one entry, for
`packages/adapters/sandbox-mxc/src/sdk-download.ts`, which imports MXC's SDK from the folder
it was downloaded to. The entry says the folder holds only packages whose integrity matches the
one pinned in the repository, and that a folder under a skill's `scripts/` folder is refused.
No other file changes. The downloader itself follows in a separate pull request that
merges after this one.

## Covers

- tooling/check/
