# Decision: sandbox-mxc's downloaded SDK is listed in the dependency check

- Approval: Paperclip task HAL-8806 (review of the SDK download, for HAL-7607)
- Kind: internal

MXC's SDK is downloaded on demand, to the board's answer on HAL-7606, so it never enters the
package's install. `tooling/check/dependencies.json` lists every outside package a Halonic
package may use, with a reason. This pull request adds that entry for the packages the
downloader fetches, each checked against an integrity value pinned in the repository. The
note covers it as `tooling/check/`, the guarded path that file falls under.

## Covers

- tooling/check/
