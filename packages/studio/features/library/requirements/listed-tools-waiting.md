# library.listed-tools-waiting

- Status: active
- Since: unreleased
- Source: HAL-9855; HAL-12413 (UX check C3); HAL-9376 (design check A4, HAL-9316); HAL-850 (proposal, step 1); HAL-2213

The Library feature shall show, on a connector's page, how many of its listed tools are waiting for the person's approval, with a **Review tools** button that opens the review of that connector's tools. The line and the button shall not show while the tools are being read or when no tool waits. When the tools could not be read, the page shall say so in one line with **Try again**, except when the workspace isn't trusted yet: then the line shall offer **Review**, which opens the workspace's trust check, and no **Try again**, which can't help; when the list was refused or an approval cannot be read, one line with **Review tools**, which opens the screen that explains it. On a phone the line shall show but approving is for the desktop: in place of **Review tools** it shall say "View only here. Review the tools on the computer running Halonic." A connector page opened without a listed-tools service shall show neither.

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
