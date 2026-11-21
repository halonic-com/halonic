# routines.triggers.add-trigger-creates-routine

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 15); flow-routines 2.3; HAL-13504

When the person presses Add trigger, the Triggers section shall ask the host to make a manual routine that starts the owner and open its page on its Trigger picker (`openItem`'s `step: "trigger"`), and when the host can't, the section shall say why and keep its rows. On an agent, Add trigger shall first show a **Prompt**, focused, that starts empty with the hint "Describe what to do." and the line "Say what *Name* should do.", with **Add trigger** and **Cancel**, and make the routine with that prompt only once one is typed: while it is empty, **Add trigger** makes nothing, focuses **Prompt** and marks "Say what *Name* should do." as its error, and **Cancel** hides it and makes nothing.

## Examples

- Given the host makes the routine daily-2, then its page opens asking for the Trigger picker. Given the host rejects, then the section says "Couldn't add a trigger." and the reason.
- Given a workflow, then Add trigger makes the routine at once, with no **Prompt**.
- Given the agent Writer, then Add trigger makes nothing yet and shows an empty, focused **Prompt** with the hint "Describe what to do." and "Say what Writer should do." under it; pressed again while empty, it makes nothing and marks the line as the error; given the prompt "Draft the newsletter", it makes the routine with that prompt and opens its page; **Cancel** hides the Prompt and makes nothing.
