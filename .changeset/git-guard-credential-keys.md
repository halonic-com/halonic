---
"@halonicjs/app-studio": patch
---

Studio refuses to run git in a repository whose own config sets credential settings other than `credential.helper`, `credential.username` and `credential.useHttpPath`, or any `trace2.*` setting, because your credential helper reads them too; the same settings in your own git config still apply.
