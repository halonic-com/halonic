# cli.deploy-output

- Status: active
- Since: unreleased
- Source: HAL-6702; the deploy flow on HAL-6687 (sections 2.8 to 2.10, 3.6, 3.7 and 4, revision 5), approved by the board on HAL-6814; the warnings after the switch from Liam's HAL-9255 review; the failure lines from HAL-16750 and words check C759 row 3 (HAL-16746); the stop lines from words check C787 (HAL-17198)

While `halonic deploy` deploys, each step shall show one live line in the present tense ("Creating the Worker acme", "Updating the database", "Uploading version 1 · 41 files", "Self-test of version 1", "Making version 1 live"), replaced by its ✓ line in the past tense once the step is done. The things a deploy creates shall share one ✓ line, "✓ Created the Worker acme, the D1 database acme-data and the R2 bucket acme-blobs.", using the names the user meets on Cloudflare: the workers.dev address, the Worker, the D1 database, the R2 bucket. The database shall be "✓ Set up the database." the first time and "✓ Updated the database: <n> changes." after; the upload "✓ Uploaded version <n> with <n> secrets."; the self-test "✓ Self-test of version <n> passed."; making a version live shall have no ✓ line of its own. A deploy that went live shall end with "✓ <workspace> is live on <deployment>: <address>" and, indented, "Deployed commit <commit> as version <n> in <time>.", naming the Halonic version and the one before ("with Halonic 0.3.1 (was 0.3.0)") when they differ, and followed on the same line by "Version <n> is kept: halonic deploy rollback <deployment>" when there's a version before it. A deploy that changed nothing shall say only "✓ <deployment> already runs commit <commit> with Halonic <version>. Nothing changed on Cloudflare." When the host doesn't give the commit or the Halonic version, these lines shall leave out "commit <commit>" and "with Halonic <version>" rather than print them empty: "Deployed version <n> in <time>." and "✓ <deployment> is already up to date. Nothing changed on Cloudflare." Every warning the deploy target gives, during the deploy or in its result after the switch, shall be shown as its own "! <warning>" line on stderr, none dropped or merged. If a deploy fails and the target says what still serves (a deploy that was stopped, or that lost its lock before the switch), then line 1 shall end with "Version <n> is still live.", or "Nothing is live on <deployment> yet." when nothing serves; the line under it shall name the step it stopped after ("It stopped after uploading version 2."); and the fix shall be the target's own, else "Run halonic deploy <deployment> again to finish. It picks up what's already there." after a stop and "Run halonic deploy again." after a lost lock. With `--json`, such a failure shall also hold `live` and `stoppedAfter`. A deploy that Ctrl C, SIGTERM or a closed terminal stopped shall not use that ✕ shape, and never say "interrupted" or "job" (deploy flow 3.7, words check C787 row 1): line 1 shall name the step and what still serves, "Stopped after uploading version 2. Version 1 is still live.", "Stopped after 1 of 2 database changes. Version 1 is still live." after database changes, or "Stopped. Version 2 is uploaded but not live. Version 1 is still live." in the self-test, followed, except in the self-test, by "  Run halonic deploy <deployment> again to finish. It picks up what's already there."; a stop before anything changed shall say "Stopped. Nothing changed on Cloudflare."; on a first deploy "Nothing is live on <deployment> yet." shall take the still-live sentence's place and "Your answers are kept." shall come before the fix; it shall exit 130, 143 or 129, and `--json` shall hold `live` and `stoppedAfter`. A stop after making a version live shall never name that step next to an older version still live (C787 row 3). With `--json`, every event of the deploy shall be its own JSON line, and the result shall hold the deployment, the address, the version, the commit, the Halonic version and every warning in `warnings`.

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
- Given a deploy as version 2 in 38 s, with version 1 before it, whose commit the host doesn't give,
  when it ends,
  then it prints "  Deployed version 2 in 38 s. Version 1 is kept: halonic deploy rollback web".
- Given a deploy that changed nothing, on a host that gives neither the commit nor the Halonic version,
  when it ends,
  then it prints "✓ web is already up to date. Nothing changed on Cloudflare.".
- Given a deploy that lost its lock to another deploy after uploading version 2, while version 1 serves,
  when it fails,
  then it prints "✕ Couldn't deploy web: another deploy took over while this one was running, so this one stopped. Version 1 is still live.", "  It stopped after uploading version 2." and "  Run halonic deploy again once the other deploy has finished.".
- Given a first deploy that lost its hold, with nothing serving,
  when it fails,
  then line 1 ends with "Nothing is live on web yet." and the fix is "Run halonic deploy again.".
- Given a deploy stopped after creating the D1 database acme-data,
  when it fails,
  then it prints "  It stopped after creating the D1 database acme-data." and "  Run halonic deploy web again to finish. It picks up what's already there.", and `--json` holds `live` and `stoppedAfter`.
- Given a deploy stopped by Ctrl C after uploading version 2, while version 1 serves,
  when it stops,
  then it prints "Stopped after uploading version 2. Version 1 is still live." and "  Run halonic deploy web again to finish. It picks up what's already there.", with no ✕ line, and exits 130.
- Given a first deploy stopped by Ctrl C in the self-test of version 1,
  when it stops,
  then it prints "Stopped. Version 1 is uploaded but not live. Nothing is live on web yet." and "  Your answers are kept.".
