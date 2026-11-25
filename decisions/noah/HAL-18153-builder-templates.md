# Decision: the plugin builder puts the workspace's templates in the snapshot

- Approval: the task HAL-18153 asks for it, as the follow-up to HAL-18141 (templates in the snapshot) for the builder from HAL-17950; Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Ylu0FJdyT7RAA8OMCAqVPfbD9HLhj+8uCfPl6jm41/2hPjDipg7kL0BZYKHac6hSvLJuBqCx5uBNkYriQ65ADQ==

`halonic build paperclip-plugin` now reads the workspace's templates (`library/templates/<id>.md`) as well as its tools and passes them to the plugin build service, which puts them in the snapshot's optional `templates` list. A workspace without templates gets the same snapshot as before, so its plugin keeps its bytes. The release file names a commit, so the commit check now also covers template files: a template file with changes that aren't committed, or one git doesn't have, is refused like a tool file. Nothing else about the build changes: the capabilities, settings and change list still come from the tools and the runtime only.

## Covers

- app.plugin-build
- cli.commands.build.paperclip-plugin
