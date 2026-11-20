# Decision: the page's engine starts a run's connectors on the agent host

- Approval: Liam signs this on HAL-13344 (item 4 of HAL-13318; Owen reviews the connector part)
- Kind: user-visible

`studio.engine-service` (draft) said the page refuses as `unavailable` every workflow with an agent
that lists a connector, because the page could start none. Where the agent host runs, the page's
engine now starts them there, as the Library's listing does (`studioRunConnectors`): `stdio`
connectors only, in the workspace folder, with the grant a person already saved and no trust
prompt. Their listed tools are offered only once a person approved them in the Library, checked
against the same store, folder location and server address the Library approves at
(`studioListedToolApproval`); a tool that isn't approved stays off, and the page warns once that it
waits. An agent that lists a connector that isn't `stdio`, such as an `http` one, stays refused as
`unavailable`, because the agent host can't start it, with the connector named ("Reporter uses
the connector "crm", which Studio can't start yet.") and the command that starts the run in a
terminal, as the page's other refusals say it (`page-refusal.ts`). The connectors close when the run ends and
when the engine closes, before the lock is given back. Every run the page starts now records that
it reads the saved files, because the page makes no copy at a commit; a run of the live version
starts no program. Where no agent host runs, the refusal stays as it was. No test is removed or
weakened: the old refusal test still passes, because the engine service it builds has no agent
host; six tests are added. The close-order test checks that the lock is still held when the connectors
close by reading the shell's lock calls at that moment, since the lock no longer goes through the
`ipc` the test used to wrap.

## Covers

- studio.engine-service
