# agents.configuration.tools

- Status: draft
- Since: unreleased
- Source: HAL-12398 (T6, HAL-1299); flow-agents 5.2; microcopy 8.5 (HAL-12418, HAL-12870); HAL-14377 (AG3, AG5)

The agents feature shall give the agent's Configuration a Tools page with three lists, Skills, Knowledge and Connectors, that shows each item the agent's file names as a chip with its name and a ✕ that removes it, offers under each list an Add button whose picker lists the Library items of that kind the agent's hub can use and doesn't have yet, saves the whole list when an item is added or removed, and shows an empty list as its Add button alone. In place of the button it shall say "No skills this hub can use yet." when the hub can use none of the kind and "No more skills to add." when the agent has them all (or the knowledge or connector form), each followed by **Open Library ›**, which opens Library on that kind's tab where the app can; each **Open Library** shall be described by its line, and its "›" shall not be read. The three lists' headings shall be second-level headings under the page's title. An item the hub can't use, because the Library doesn't have it or the hub's `uses` leaves it out, shall keep its chip, by its id, with a danger edge and the line "This hub can't use a skill called *id*." (or "knowledge source", "connector") under its list. When the Library can't be read, the page shall say "Couldn't load the Library" with the reason and **Try again** above the lists, and still show the chips with their ✕, but no Add buttons and no line about a missing item.

## Examples

- Given the agent uses the skill refunds, named "Refund policy", then Skills shows a chip "Refund policy".
- Given the hub can use the skill refunds and the agent doesn't, when the person picks "Refund policy" under **Add skill**, then the agent's skills are saved as refunds.
- Given the agent uses refunds, when the person presses ✕ on its chip, then the agent's skills are saved as none, and Skills shows only **Add skill**.
- Given the agent's file names a knowledge source old-notes the hub can't use, then its chip shows "old-notes" with a danger edge, Knowledge says "This hub can't use a knowledge source called old-notes.", and ✕ removes it.
- Given the hub can use no connectors, then Connectors says "No connectors this hub can use yet. Open Library ›" and has no Add button, and Open Library opens Library on Connectors.
- Given the hub can use no connectors, then Connectors' **Open Library** is described by "No connectors this hub can use yet." and its "›" isn't read.
- Given the agent already has the hub's one knowledge source, then Knowledge says "No more knowledge to add. Open Library ›".
- Given reading the Library fails, then the page says "Couldn't load the Library" with the reason above the lists, the chips stay with their ✕, and Try again shows the Add buttons once the read works.
