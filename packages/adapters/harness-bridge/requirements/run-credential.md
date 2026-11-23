# harness-bridge.run-credential

- Status: active
- Since: unreleased
- Source: HAL-13211 (a harness step on the Cloudflare Worker runs in a container per run); the credential's shape is agreed on HAL-13221

When a run's program runs away from the machine Halonic runs on, such as in a container, the bridge shall give the run one credential of 32 random bytes from WebCrypto and keep only its SHA-256 with the run's binding, so the credential is the program's only way to reach the bridge and a copy of what is stored can't call it. A request's credential shall be checked under the run the request reached, never under a run the request names, and the digests shall be compared in constant time. A request with no credential, with another run's credential, after the run's deadline, or after the run ended shall be refused. When the run ends, however it ends, the credential shall be revoked, and a run that already had a credential shall never get another, even when two requests for it come at once. A credential shall be given only for a deadline still to come. The bridge's Web-only entry point shall use no Node API, so the Cloudflare Worker can import it.

## Examples

- Given a run that was given a credential,
  when a request for that run sends it,
  then the check passes and gives the run's binding.
- Given two runs that were each given a credential,
  when a request for the first run sends the second run's credential,
  then it is refused.
- Given a run that was given a credential,
  when a request sends none, or sends it after the run's deadline,
  then it is refused.
- Given a run whose credential was revoked when the run ended,
  when a request sends the credential,
  then it is refused, and asking for a new credential for the run is refused too.
- Given a run's stored record,
  when it is read,
  then it holds the credential's SHA-256, not the credential.
