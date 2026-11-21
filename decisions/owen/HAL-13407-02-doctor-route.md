# Decision: the agent host runs Studio's doctor checks that need Node

- Approval: Paperclip task HAL-13407 (Liam's decision of 21 Nov: a security PR, with its rules); first-run-progress task 4 on HAL-7986; Julian signs this note, Liam reviews
- Kind: internal

Studio's "Check this computer" needs checks its page can't run: the sandbox, the harness programs, the trust records and the model servers on this computer. The agent host gets `POST /v1/doctor`, through `startHostServer` like every route, which runs `halonic doctor`'s own service (`adapters/doctor-node`, moved there from the CLI by the PR below this one) on the host's parts, and answers facts and ids. The page gets `AgentHostDoctor.doctor()` and the shell's route table names the route. Nothing shows it to a person until HAL-13411.

- **Input:** only an optional workspace folder, which must be one the launcher named (`namedWorkspace`, as `profile-route`): `404 unknown_workspace` otherwise, `404 no_workspace` for a named folder without `workspace.yaml`. The body is strict. Served only with a profile folder.
- **What it answers:** the Workspace, Models, Sandbox, Harnesses, Network and Disk lines, each with its `actions`, and their counts. The workspace reaches the service field by field (name, trust, its model servers on this computer and their aliases, file problems, the watch limit, the WSL drive), so its secrets, its cloud providers' keys and its default model never do. The key lines aren't answered (the host holds no keychain; the service gets a secrets store that only refuses), nor Node.js, Default model or Last run.
- **Read only:** the trust store the service gets has a `grant` and `revoke` that do nothing, so a record the check would shrink stays as it is until the next `run` or `trust`. The agents' own sign-ins are not asked: that runs Claude Code or Codex with the agent's settings folder in the profile, and those programs may write there. This departs from the task's plan, which wanted that line to read "Couldn't check" when asking would write; the Harnesses line still reports which programs are installed and supported, and the page can ask one agent's sign-in through `POST /v1/harnesses/detect` as today. So the input takes no list of agents with a provider key.
- **Network:** the CLI's rule (`modelSourceOf`): a server at another address than this computer's is asked only once the workspace is trusted here. Cloud providers are never asked, and no model test runs. The client is `connectorHostClass` through the host's proxy setting, refusing the host's own ports, with the doctor's 5-second limit on each check.
- **Limits and errors:** one check at a time, `429 busy` for another, no queue. A check that throws answers `500 doctor_failed` with a fixed message, and the log gets a fixed line: no error text, token, key, environment variable or program output.

## Covers

- agent-host.doctor-route
- agent-host-client.doctor
