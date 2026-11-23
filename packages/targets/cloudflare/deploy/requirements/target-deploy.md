# deploy.target-deploy

- Status: active
- Since: unreleased
- Source: HAL-6702; the entry's design (deploy-target-entry, section 3); HAL-16060 (the Worker is built at release); deploy flow 2.8 to 2.10 and 3.7 (HAL-6687)

The target's `deploy` shall upload the Worker its injected loader gives, and until a loader is given shall reject with `unexpected` (`internal`) before any call to Cloudflare. It shall not validate or test the snapshot again, since the app service did. It shall write the snapshot's files to the definitions bucket, bind the database, the blobs bucket and the Worker's Durable Objects, give the Worker its workers.dev host as the allowed host and the deployment's name as its id, and send each secret as `HALONIC_SECRET_<NAME>` in the upload only, never in a result, an event or a failure. It shall apply the Worker's Durable Object migrations on its first deploy only. It shall report each step as the port's events in the order it runs: each resource it creates, the database changes, the upload, the self-test and the switch, with the switch before the self-test when the version went live with its upload. The new version shall be numbered after the live one. A failed self-test shall be the `self-test-failed` result, with the version that still serves, not a failure. A stop shall reject with `stopped`, what still serves (`none` when nothing does) and the step it stopped after. A lock the deploy held and lost before traffic moved shall reject with `deploy-locked` and the same two fields, because the snapshot or database changes may already be written.

Rationale: the command prints each step as it happens (flow 2.8) and says what still serves when a deploy stops or fails (3.7), so the target has to say it, in the port's words.

## Examples

- Given an account with nothing deployed, when `deploy` is called, then it creates the database, both buckets and the Worker, sets up the database, uploads version 1 live, self-tests it, and gives no previous version.
- Given version 2 live, when `deploy` is called, then version 3 is uploaded without traffic, self-tested, then switched, and version 2 is the previous version.
- Given a self-test that fails with version 1 live, when `deploy` is called, then the result is `self-test-failed` and version 1 still serves.
- Given a stop after the Worker was created, when `deploy` is called, then it rejects with `stopped`, `live` is `none` and the step it stopped after is the Worker's creation.
- Given version 1 live and another deploy that takes the lock over once the snapshot is written, when `deploy` is called, then it rejects with `deploy-locked`, `live` is version 1, and nothing is uploaded.
- Given no Worker loader, when `deploy` is called, then it rejects with `unexpected` and Cloudflare isn't called.
