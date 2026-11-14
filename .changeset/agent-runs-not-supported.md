---
"@halonicjs/ports": patch
"@halonicjs/engine": patch
"@halonicjs/host-server": patch
"@halonicjs/adapter-executor-remote": patch
---

`POST /api/agent-runs` on a served host answers 501 `agent_runs_not_supported` instead of a 500, because the local executor can't start agent runs yet. The ports give `AgentRunsNotSupported` for it, and the remote executor rebuilds it from the 501.
