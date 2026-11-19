# agents.page.cards

- Status: draft
- Since: unreleased
- Source: HAL-13179 (T6); flow-agents 5.1, 5.4 and 7 (K6); T6 checklist 1.10 and 2.3; req-shell `cards.*`

The agents feature shall mount the shell's stacked cards on the agent page's Configuration view, so that a subagent's name on the Subagents page opens that agent as a card on top of the panel, with the path "*Acme Mail* › *Mail triage* › *Writer*", showing the subagent's team chart (`agents.editor.team-chart`: the subagent as the larger card, the agents that hand it work above it and the agents it hands work to below it, named "Who works with *Writer*", absent while it works alone, where another agent opens its page and the subagent itself is not a link) and its own Configuration with its page list as a Select at the top (the narrow panel), where its own subagents open as cards on top of it. A part of the path, ←, Esc and the room round the cards shall go back as the shell's cards do. Picking another view of the page shall close every card. An agent step opens as a card from the Agent steps page (`agents.configuration.agent-steps`). When a card's agent or agent step is gone, its card and every card above it shall drop, and "*Writer* was removed." shall be read. A failed save in a card shall show "Couldn't save: *reason*" as a toast.

## Examples

- Given Mail triage hands work to Writer, when the person presses Writer on the Subagents page, then a card opens with the path "Acme Mail › Mail triage › Writer" and Writer's Configuration, its pages in a Select.
- Given Writer hands work to Fact checker, when the person opens Writer's Subagents in its card and presses Fact checker, then the path is "… › Writer › Fact checker"; pressing Writer in the path goes back to Writer's card.
- Given a card is open, when Esc is pressed, then the card closes.
- Given a card is open, when the person picks Runs and then Configuration, then no card is open.
- Given Writer's card is open, when Writer is moved to the trash, then the card drops and "Writer was removed." is read.
- Given Writer's card is open, then its team chart shows Mail triage above Writer and Fact checker below it; pressing Fact checker opens Fact checker's page.
- Given Writer's card is open, when Mail triage stops handing work to Writer, then the card stays and its team chart is gone.
