# deploy.destroy

- Status: active
- Since: 0.1.0
- Source: HAL-6705; build plan 3b (HAL-198); multi-cloud ADR 5.6, 5.9

`destroy` shall delete what a deploy created, in this order: the Worker, the bucket, the database. It shall delete only resources marked as Halonic's, and refuse before deleting anything when one exists that isn't. It shall call `confirm` with the list before it deletes, and stop if the answer is no. It shall hold the deploy lock while it works and renew it between deletes. A resource that is already gone shall be skipped, so a second run finishes a failed first one. A bucket that holds files shall fail with `bucket-not-empty`. `plan` shall list and change nothing. The live-test sweeper shall delete through the same call, and shall list and delete only names with its prefix.

Rationale: removing a deployment deletes user data for good, so it asks first, never touches what isn't ours, and can be safely repeated.

## Examples

- Given a marked Worker, bucket and database, then `destroy` deletes them in that order after `confirm` says yes.
- Given `confirm` says no, then nothing is deleted.
- Given an unmarked bucket, then `destroy` stops with `destroy-refused` and deletes nothing.
- Given the Worker is already gone, then `destroy` skips it and deletes the rest.
- Given a bucket with files, then `destroy` stops with `bucket-not-empty` and frees the lock.
- Given the sweeper is asked to delete a name without its prefix, then it refuses.
