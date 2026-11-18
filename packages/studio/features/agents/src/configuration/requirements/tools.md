# agents.configuration.tools

- Status: draft
- Since: unreleased
- Source: HAL-12398 (T6, HAL-1299); flow-agents 5.2

The agents feature shall give the agent's Configuration a Tools page with three lists, Skills, Knowledge and Connectors, that shows each item the agent's file names as a chip with its name and a ✕ that removes it, offers under each list an Add button whose picker lists the Library items of that kind the agent's hub can use and doesn't have yet, saves the whole list when an item is added or removed, says so when a list is empty, says "Make a skill in Library to add it here." (or the knowledge or connector form) in place of the button when there is nothing left to add, and, when the Library can't be read, says "Couldn't load the Library" with **Try again**.

## Examples

- Given the agent uses the skill refunds, named "Refund policy", then Skills shows a chip "Refund policy".
- Given the hub can use the skill refunds and the agent doesn't, when the person picks "Refund policy" under **Add skill**, then the agent's skills are saved as refunds.
- Given the agent uses refunds, when the person presses ✕ on its chip, then the agent's skills are saved as none, and the list says "It uses no skills yet.".
- Given the agent's file names a knowledge source the hub can't use, then its chip shows the id, and ✕ removes it.
- Given the hub has no connectors, then Connectors says "Make a connector in Library to add it here." and has no Add button.
- Given reading the Library fails, then the page says "Couldn't load the Library", and Try again shows the lists once the read works.
