# Decision: deny the home folder as a whole and reopen the runner's own paths

- Approval: [HAL-5825](/HAL/issues/HAL-5825)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7ZiJnERzUAapgo/Hk56fsfUOmUHLLJgzdmy6KM2DeanKeIzQz08KupyZg6DOutfm3M/K6jeEXrv7ANLBBg05CQ==

The runner's untrusted profile hid the home folder and the socket folders by
listing every entry that wasn't on the way to a path the runner needs, once,
when the profile was built. A folder made there later stayed readable for
the rest of the session. Liam accepted that in HAL-4621 because no profile
could allow a path inside a denied one. #1848 (HAL-5644) adds
`SandboxProfile.reopenedPaths`, and srt 0.0.81 ranks `allowRead` above
`denyRead` on every system, so that reason is gone: the profile now denies
those folders as a whole and reopens Node's folder, the runner, the
integration's folder and the temp folder inside them.

On Windows the profile keeps denying the folders' other entries by name
and reopens nothing, as harness-kit does for Halonic's data folder since
#1848's Windows fence job: a deny on a folder there also takes the right to
look at the folders on the way to a path inside it, so Node couldn't
resolve the runner's path in a reopened folder. What is made in the home
folder later is kept out by its own access list, except a folder another
sandboxed session makes and writes (threat model 4.6, Known limits).

`integration-runner.start` changes accordingly: the paragraph that accepted
the snapshot now describes the whole-folder deny and the Windows limit, the
listing refusal applies on Windows only, and the examples about the home
folder and the Node symlink say "reopened" instead of "not hidden". A new
example covers a folder made after the profile is built. The tests of
`runner-profile.test.ts` that checked the entry-by-entry list now check the
whole-folder deny and the reopened paths, and the entry-by-entry checks move
to the Windows case, which also checks that nothing is reopened.

## Covers

- integration-runner.start
- packages/adapters/integration-runner/src/halonic/runner-profile.test.ts
