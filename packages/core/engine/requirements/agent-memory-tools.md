# engine.agent-memory-tools

- Status: active
- Since: 0.1.0
- Source: HAL-1534, HAL-3079, plan HAL-186 ("Agent memory as runtime data")

The engine shall give an agent's model three Halonic tools for its memory: `memory_list` gives every note with its title and text, `memory_save` keeps a note under a title, and `memory_forget` removes the note with a title and names it as it was saved. A call with a missing or non-string argument, or a save the memory refuses, shall fail, so the model gets the error. When the local executor has a memory store and a chat turn names an agent, the turn shall offer that agent's memory tools after the other Halonic tools; a turn without an agent, or an executor without a store, offers none.

## Examples

- Given an executor with a memory store,
  when a chat turn for agent `clerk` calls `memory_save` with title "Refunds" and text "Ask for the order number", and a later turn calls `memory_list`,
  then the later turn's model gets the note "Refunds" with its text.
- Given an executor with a memory store,
  when a chat turn names no agent,
  then no memory tool is offered.
- Given an agent with no note "Refunds",
  when the model calls `memory_forget` with "Refunds",
  then it gets "There is no note titled \"Refunds\"."
