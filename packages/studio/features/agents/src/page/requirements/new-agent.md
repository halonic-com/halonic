# agents.page.new-agent

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A2, from the UX check HAL-12213); flow-agents 2.2; checklist 9.2

When an agent is made in the New agent dialog with nothing written in "What should it do?", the agents feature shall open its page on Configuration › Behaviour with **Instructions** focused instead of on Runs, which has nothing to show for a new agent; opening the same agent later shall start on Runs as usual.

## Examples

- Given the person creates "Blank" with the box left empty, then its tab shows Configuration › Behaviour and the cursor is in Instructions.
- Given the person creates an agent with "Check refunds." written, then its page opens on Runs.
- Given the page of a just-made agent was drawn and the person opens it again later, then it starts on Runs.
- Given the person goes to another page of Configuration and back, then Instructions doesn't take the focus again.
