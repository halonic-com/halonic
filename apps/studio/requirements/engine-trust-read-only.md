# studio.engine-trust-read-only

- Status: active
- Since: unreleased
- Source: HAL-16381 (Liam's decisions 1 and 2): the engine's trust checks read its copy of the saved files, which a later save and trust can outdate

The Studio shall check a workspace it already loaded, such as the engine's copy of the files as saved at its latest start, answer or routine's start, as `app.trust-service-read-only` says: the same answer, but never writing the trust record. That covers the engine's check when the trust changes, before a harness step, before a key goes to a provider, and at every start, answer and cancel, and the Library's and the run connectors' checks. Only the workspace's own trust check, which reads the files itself and shows the result, shall shrink the record to files that lost something. A read-only check of a copy that holds something the record lacks shall say the workspace isn't trusted. The grant a read-only check gives, which the run connectors and the Library pass to the agent host, shall be the stored record's, so the host's own check of it against the trust store passes.

## Examples

- Given the engine is open on Acme, which a person trusted,
  when the person adds the connector "files", saves, and trusts Acme again,
  then the engine's check on that trust change leaves the record with "files", the engine stays open, and the next check of the folder says trusted without asking.
- Given a run is going in Acme's engine and the person adds and trusts the connector "files",
  when the run's next step asks whether its copy of Acme is trusted,
  then it is, and the record still holds "files".
- Given a person trusted Acme without "files",
  when the engine checks a copy of Acme with "files",
  then the workspace isn't trusted, and the record is as it was.
- Given a person trusted Acme with the connector "files", and "files" was removed since,
  when the run connectors check their copy of Acme,
  then it is trusted, the grant they pass on has the stored record's fingerprint, and the record is as it was.
