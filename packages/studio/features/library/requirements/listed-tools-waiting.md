# library.listed-tools-waiting

- Status: active
- Since: unreleased
- Source: HAL-9855; HAL-12413 (UX check C2, C3 and G2); HAL-9376 (design check A4, HAL-9316); HAL-850 (proposal, step 1); HAL-2213

The Library feature shall show, on a connector's page, how many of its listed tools are waiting for the person's approval, with a **Review tools** button that opens the review of that connector's tools. The line and the button shall not show while the tools are being read or when no tool waits. When the tools could not be read, the page shall say so in one line with **Try again**, except when the workspace isn't trusted yet: then the line shall offer **Review**, which opens the workspace's trust check, and no **Try again**, which can't help. When the agent host says why, the line shall say it: a program that isn't on this computer by its name, in code type; a secret that isn't set, or that the server refused, by its name, with the `halonic secret set` command that sets it under the line (a refused secret whose name Halonic can't tell gets no command); a program that stopped before it answered, with **Copy details**. An engine that isn't answering shall be worded as on every screen, in the words for where Studio runs, and any other failure shall give its reason, or the sentence for a problem Halonic can't explain with **Copy details**; when the list was refused or an approval cannot be read, one line with **Review tools**, which opens the screen that explains it. On a phone the line shall show but approving is for the desktop: in place of **Review tools** it shall say "View only here. Review the tools on the computer running Halonic." A connector page opened without a listed-tools service shall show neither.

## Examples

- Given a connector with two tools waiting,
  when its page opens,
  then it says "2 tools are waiting for your approval" and offers **Review tools**.
- Given that line,
  when the person asks for **Review tools**,
  then the review of that connector's tools opens.
- Given a connector with a tool waiting,
  when its page opens on a phone,
  then it says how many wait and "View only here. Review the tools on the computer running Halonic.", with no **Review tools** button.
- Given a connector with no tool waiting,
  when its page opens,
  then it shows no line and no **Review tools** button.
- Given a workspace that isn't trusted yet,
  when a connector's page opens,
  then it says "Couldn't list the tools: this workspace isn't trusted yet, so nothing was started." with **Review**, which opens the trust check, and no **Try again**.
- Given a connector whose secret NOTES_TOKEN isn't set,
  when its page opens,
  then it says "Couldn't list the tools: notes-mcp needs the secret NOTES_TOKEN, which isn't set on this computer. Set it in a terminal, then try again:" with `halonic secret set NOTES_TOKEN` under it and **Try again**.
- Given a connector whose program `npx` isn't on this computer,
  when its page opens,
  then it says "Couldn't list the tools: notes-mcp needs the program `npx`, which isn't on this computer. Install it, then try again." with **Try again**.
- Given a connector whose program stopped before it answered,
  when its page opens,
  then it says "Couldn't list the tools: notes-mcp stopped before it answered." with **Try again** and **Copy details**.
- Given an engine that isn't answering, in the desktop app,
  when a connector's page opens,
  then it says "Couldn't list the tools: the engine isn't answering. It may still be starting." with **Try again**.
