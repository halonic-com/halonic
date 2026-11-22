# library.listed-tools-waiting

- Status: active
- Since: unreleased
- Source: HAL-9855; HAL-12413 (UX check C2, C3 and G2); HAL-9376 (design check A4, HAL-9316); HAL-850 (proposal, step 1); HAL-2213; HAL-12369 (UX check L7, HAL-12363); HAL-14649; HAL-14995 (the stopgap, then the Secrets section); HAL-15606 (C600 #1c: a program that stopped right after it started, in the CLI's words); HAL-15809 (C634 #5: its file and the line to run); HAL-15813 (C633 row 24: the connector's program); HAL-15903 (the line when every tool is on, from microcopy 27 W14 in HAL-15645's words); HAL-15915 (C651 #4: the line leaves out env and secrets, and a Windows folder gets none); HAL-15922 (C650 row 6: the sentence points to the line, in a terminal); HAL-16099 (C672 #4: the CLI's words, and a full stop when no line to run follows)

The Library feature shall show, on a connector's page, how many of its listed tools are waiting for the person's approval, with a **Review tools** button that opens the review of that connector's tools. When no tool waits, nothing failed and some of its listed tools are on, the page shall say how many are on ("3 tools are on.", "1 tool is on."), as the CLI's review ends, with the same **Review tools**, which opens the review with nothing waiting, where **Remove approval** switches a tool off again. No line and no button shall show while the tools are being read, or when no tool waits and none is on. When the tools could not be read, the page shall say so in one line with **Try again**, except when the workspace isn't trusted yet: then the line shall offer **Review**, which opens the workspace's trust check, and no **Try again**, which can't help. When the agent host says why, the line shall say it: a program that isn't on this computer by its name, in code type; a secret that isn't set, or that the server refused, by its name, followed by "Studio can't set a connector's secrets yet." and no command, since `halonic secret set` writes the profile's secrets file and Studio reads a connector's secrets from the keychain, or, where the page has a Secrets section (`library.connector-secrets`), by "Set it under Secrets, then try again."; since the server doesn't say which secret it refused, a connector with several secrets shall have them all named in the line, and a connector with none shall have the line say the server asked for a secret the connector doesn't send, with **Copy details** and no command; a program that stopped by itself right after it started in `halonic tools review`'s words, "Couldn't list the tools from <connector>: its program <program> stopped right after it started." with the program in code type, then "To see why, run the command and args from <file> yourself.", naming the connector file's path in the workspace in code type ("the <connector> connector file" when no file holds the connector), and, where the agent host gives the line that starts the program by hand, with "in a terminal" in place of "yourself", then "The line below doesn't set its env or secrets, so set any it needs first:" and that line in a CommandBox under it, or, where it gives none, as for a Windows folder, with the CLI's sentence followed by "Studio can't give you a line to copy for a Windows folder yet.", so the line ends on a colon only when a CommandBox follows it; a program that stopped before it answered otherwise, with **Copy details**. An engine that isn't answering shall be worded as on every screen, in the words for where Studio runs, and any other failure shall give its reason, or the sentence for a problem Halonic can't explain with **Copy details**; when the list was refused or an approval cannot be read, one line with **Review tools**, which opens the screen that explains it. On a phone the line shall show but approving is for the desktop: in place of **Review tools** it shall say "View only here. Review the tools on the computer running Halonic." For an MCP server over HTTP, whose tools Studio can't list yet, the page shall instead say "Studio can't list this server's tools yet. To review them, run this in a terminal:" ("on your computer" on a phone) with the command `halonic tools review` and the connector id in a CommandBox, naming the workspace folder as `app.halonic-command` builds it, and no **Try again**; where `app.halonic-command` gives no command, as for a Windows folder, it shall say only "Studio can't list this server's tools yet." A connector page opened without a listed-tools service shall show none of these.

## Examples

- Given a connector with two tools waiting,
  when its page opens,
  then it says "2 tools are off until you review them" and offers **Review tools**.
- Given that line,
  when the person asks for **Review tools**,
  then the review of that connector's tools opens.
- Given a connector with a tool waiting,
  when its page opens on a phone,
  then it says how many wait and "View only here. Review the tools on the computer running Halonic.", with no **Review tools** button.
- Given a connector with no tool waiting and three tools on,
  when its page opens,
  then it says "3 tools are on." and offers **Review tools**, which opens the review with those three under Approved, each with **Remove approval**.
- Given a connector with no tool waiting and one tool on,
  when its page opens on a phone,
  then it says "1 tool is on." and "View only here. Review the tools on the computer running Halonic.", with no **Review tools** button.
- Given a connector with no tool waiting and none on,
  when its page opens,
  then it shows no line and no **Review tools** button.
- Given a workspace that isn't trusted yet,
  when a connector's page opens,
  then it says "Couldn't list the tools: this workspace isn't trusted yet, so nothing was started." with **Review**, which opens the trust check, and no **Try again**.
- Given a connector whose secret NOTES_TOKEN isn't set,
  when its page opens,
  then it says "Couldn't list the tools: notes-mcp needs the secret NOTES_TOKEN, which isn't set for Studio. Studio can't set a connector's secrets yet." with **Try again** and no command.
- Given a connector whose secrets are NOTES_TOKEN and NOTES_SPACE, and whose server refused one,
  when its page opens,
  then it says "Couldn't list the tools: notes-mcp didn't accept one of its secrets, NOTES_TOKEN or NOTES_SPACE. Studio can't set a connector's secrets yet." with **Try again** and no command.
- Given a connector with no secret, whose server asked for one,
  when its page opens,
  then it says "Couldn't list the tools: the server for notes-mcp asked for a secret, and notes-mcp doesn't send one." with **Try again** and **Copy details**.
- Given a connector whose program `npx` isn't on this computer,
  when its page opens,
  then it says "Couldn't list the tools: notes-mcp needs the program `npx`, which isn't on this computer. Install it, then try again." with **Try again**.
- Given a connector in `library/connectors/notes-mcp.connector.yaml` whose program `sh` stopped right after it started,
  when its page opens,
  then it says "Couldn't list the tools from notes-mcp: its program `sh` stopped right after it started. To see why, run the command and args from `library/connectors/notes-mcp.connector.yaml` in a terminal. The line below doesn't set its env or secrets, so set any it needs first:" with `cd /acme && sh -c "exit 1"` in a CommandBox under it, **Try again** and no **Copy details**.
- Given the same connector in a Windows folder, for which there is no line to run,
  when its page opens,
  then the line ends "… from `library/connectors/notes-mcp.connector.yaml` yourself. Studio can't give you a line to copy for a Windows folder yet." with no CommandBox.
- Given a connector whose program stopped before it answered,
  when its page opens,
  then it says "Couldn't list the tools: notes-mcp stopped before it answered." with **Try again** and **Copy details**.
- Given an engine that isn't answering, in the desktop app,
  when a connector's page opens,
  then it says "Couldn't list the tools: the engine isn't answering. It may still be starting." with **Try again**.
- Given an MCP server over HTTP with the id notes-mcp,
  when its page opens,
  then it says "Studio can't list this server's tools yet. To review them, run this in a terminal:" with the command `halonic tools review notes-mcp` to copy, and offers no **Try again**.
- Given that server in the folder `/acme/Documents/Acme sample`,
  when its page opens,
  then the command to copy is `halonic tools review --dir "/acme/Documents/Acme sample" notes-mcp`.
- Given that server in the folder `Acme sample` in `Acme` on drive D,
  when its page opens,
  then it says only "Studio can't list this server's tools yet.", with no command and no **Try again**.
