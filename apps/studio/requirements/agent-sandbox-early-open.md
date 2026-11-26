# studio.agent-sandbox-early-open

- Status: draft
- Since: unreleased
- Source: HAL-19599 (Liam's plan on HAL-19531, step 2)

When the Studio app opens a folder, it shall give the folder its agent sandbox without waiting for the agent host to answer, so a workspace opens while the host is still starting. Until the host answers whether it opens sessions on this computer, Settings › Agent sandbox shall read that it doesn't, the cautious answer; a host that can't say shall keep that answer. The sandbox start check shall still ask the host itself, so no run starts before the host is up and its check has passed.

## Examples

- Given the agent host hasn't answered yet,
  when a folder opens on Windows,
  then its agent sandbox is there and reads that Studio doesn't start agents outside the sandbox.
- Given the folder is open and the host then answers that it opens sessions on this computer,
  then the agent sandbox reads that it does.
