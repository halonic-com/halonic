# agent-host-client.unfenced-runs

- Status: active
- Since: unreleased
- Source: HAL-3384; Liam's plan approval on HAL-12520; `agent-host.unfenced-runs-routes`

The unfenced-runs stand-in shall offer `status`, `allow` and `takeBack` over the host's `/v1/unfenced-runs` routes. `status` shall answer the host's decision as codes, and fail with `answer_invalid` for any other shape or an extra field. `allow` shall send the reason the trust check showed and nothing else, answer the saved yes, and answer `null` when the host says the reason changed, so Studio reads the status again instead of trusting. `takeBack` shall send an empty body and fail with the host's kind when the host refuses, such as `take_back_incomplete`.

## Examples

- Given a host that answers `needs-yes` for `container`,
  when Studio asks for the status,
  then the answer is `needs-yes` for `container`.
- Given a host that answers 409 `reason_changed`,
  when Studio gives the yes,
  then the answer is `null`.
- Given a host whose answer has an extra field,
  when Studio asks for the status,
  then it fails with `answer_invalid`.
