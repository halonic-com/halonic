# library.listed-tools-waiting

- Status: active
- Since: unreleased
- Source: HAL-9855; HAL-9376 (design check A4, HAL-9316); HAL-850 (proposal, step 1); HAL-2213; HAL-12369 (UX check L7, HAL-12363)

The Library feature shall show, on a connector's page, how many of its listed tools are waiting for the person's approval, with a **Review tools** button that opens the review of that connector's tools. The line and the button shall not show while the tools are being read or when no tool waits. When the tools could not be read, the page shall say so in one line with **Try again**; when the list was refused or an approval cannot be read, one line with **Review tools**, which opens the screen that explains it. For an MCP server over HTTP, whose tools Studio can't list yet, the page shall instead say "Studio can't list this server's tools yet. To review them, run this in a terminal:" ("on your computer" on a phone) with the command `halonic tools review <connector id>` in a CommandBox, and no **Try again**. A connector page opened without a listed-tools service shall show none of these.

## Examples

- Given a connector with two tools waiting,
  when its page opens,
  then it says "2 tools are waiting for your approval" and offers **Review tools**.
- Given that line,
  when the person asks for **Review tools**,
  then the review of that connector's tools opens.
- Given a connector with no tool waiting,
  when its page opens,
  then it shows no line and no **Review tools** button.
- Given an MCP server over HTTP with the id notes-mcp,
  when its page opens,
  then it says "Studio can't list this server's tools yet. To review them, run this in a terminal:" with the command `halonic tools review notes-mcp` to copy, and offers no **Try again**.
