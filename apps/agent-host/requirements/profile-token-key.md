# agent-host.profile-token-key

- Status: active
- Since: unreleased
- Source: HAL-13855 (Liam's option 2 on HAL-13854: Halonic makes the token key itself)

The agent host shall read the token key of the profile it serves as the CLI does: `HALONIC_SECRET_TOKEN_KEY` in its own environment first, then `token-key` in the profile's secrets file. When neither has one and none of the profile's token folders (`profile.token-folders`) holds a token, it shall make the key with `madeTokenKey` (`token-store.made-token-key`) the first time it seals one, and save it in the profile's secrets file, where the CLI finds it, so the Studio and the CLI share one key per profile and nobody makes one by hand. A key in the environment shall be used as it is and nothing written. The Google setup and the integration sign-ins shall use the same key.

## Examples

- Given a fresh profile and no `HALONIC_SECRET_TOKEN_KEY`,
  when the host saves a Google client secret,
  then the profile's secrets file holds a `token-key`, and a host started again over the profile opens the secret.
- Given `HALONIC_SECRET_TOKEN_KEY`,
  when the host saves a Google client secret,
  then the profile's secrets file holds no `token-key`.
- Given a fresh profile,
  when the Google setup and the integration sign-ins each seal a token at the same moment,
  then one key is saved and both tokens open with it.
