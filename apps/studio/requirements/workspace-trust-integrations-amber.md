# studio.workspace-trust-integrations-amber

- Status: active
- Since: unreleased
- Source: Iris's visual check C592 (HAL-15532, HAL-15541): the "Runs" line design section 4 (HAL-1873) has an amber form for an integration that doesn't run, and **Runs** showed it plain

Where the workspace trust check's **Runs** line says an integration "Doesn't start on this computer.", it shall show that value in the attention (amber) tone; the reason and fix lines under it, and every other line of the row, shall stay plain.

## Examples

- Given Halonic runs in a container, where the sandbox can't start,
  when the person opens the trust check,
  then **Runs** "Doesn't start on this computer." is amber and the container reason and fix under it are plain.
- Given the computer runs integrations in the sandbox,
  then no line of the integration's row is amber.
