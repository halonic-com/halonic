# cli.deploy-output

- Status: active
- Since: unreleased
- Source: HAL-6702; the deploy flow on HAL-6687 (sections 2.8 to 2.10 and 4, revision 5), approved by the board on HAL-6814; the warnings after the switch from Liam's HAL-9255 review

While `halonic deploy` deploys, each step shall show one live line in the present tense ("Creating the Worker acme", "Updating the database", "Uploading version 1 · 41 files", "Self-test of version 1", "Making version 1 live"), replaced by its ✓ line in the past tense once the step is done. The things a deploy creates shall share one ✓ line, "✓ Created the Worker acme, the D1 database acme-data and the R2 bucket acme-blobs.", using the names the user meets on Cloudflare: the workers.dev address, the Worker, the D1 database, the R2 bucket. The database shall be "✓ Set up the database." the first time and "✓ Updated the database: <n> changes." after; the upload "✓ Uploaded version <n> with <n> secrets."; the self-test "✓ Self-test of version <n> passed."; making a version live shall have no ✓ line of its own. A deploy that went live shall end with "✓ <workspace> is live on <deployment>: <address>" and, indented, "Deployed commit <commit> as version <n> in <time>.", naming the Halonic version and the one before ("with Halonic 0.3.1 (was 0.3.0)") when they differ, and followed on the same line by "Version <n> is kept: halonic deploy rollback <deployment>" when there's a version before it. A deploy that changed nothing shall say only "✓ <deployment> already runs commit <commit> with Halonic <version>. Nothing changed on Cloudflare." Every warning the deploy target gives, during the deploy or in its result after the switch, shall be shown as its own "! <warning>" line on stderr, none dropped or merged. With `--json`, every event of the deploy shall be its own JSON line, and the result shall hold the deployment, the address, the version, the commit, the Halonic version and every warning in `warnings`.

## Examples

- Given a first deploy that creates the Worker acme, the D1 database acme-data and the R2 bucket acme-blobs,
  when it deploys,
  then it prints "✓ Created the Worker acme, the D1 database acme-data and the R2 bucket acme-blobs." once, then "✓ Set up the database.", "✓ Uploaded version 1 with 2 secrets." and "✓ Self-test of version 1 passed.".
- Given a deploy of commit 8d1a04b as version 2 in 38 s, with version 1 before it,
  when it ends,
  then it prints "✓ Acme is live on web: https://acme.sam-example.workers.dev" and "  Deployed commit 8d1a04b as version 2 in 38 s. Version 1 is kept: halonic deploy rollback web".
- Given a deploy that went live but lost its lock after the switch, and gave one more warning,
  when it ends,
  then it prints both warnings as "!" lines on stderr, and `--json` holds both in `warnings`.
