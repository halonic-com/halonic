# agents.configuration.harness

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 5b); HAL-12697; HAL-13120 (H1, H2); HAL-13185 (HF1); HAL-6351 (board option 1 on HAL-5355); flow-agents 5.3; microcopy 8.5; harness-states rules 1, 2 and 4

The agents feature shall give the agent's Configuration a Harness page that lists Halonic, Claude Code and Codex as a choice under the hint "What drives this agent", saves the choice when it is made and puts it back to the saved harness when the save fails, writes under Claude Code and Codex what the host found on this computer (found with its version, not installed with **How to install**, too old with **How to update**, not signed in, couldn't check with the reason) and "Checking…" until the first answer, keeps the last answers while Studio is open and checks again behind them, always offers exactly one **Check again** (the strip's while a strip shows, else the group's) and, when a check started from one shows or clears the strip and so takes that one away, moves focus to the Check again now on the page, shows one strip above the choice in a polite live region, with **How to install** or **How to update** and **Check again**, when the chosen program isn't installed or is too old, or, with **Sign in for this agent** and **Check again**, when this agent isn't signed in to it, and, when the check itself didn't work, shows only the option's line, with no strip. **Sign in for this agent** shall ask the host to open the program's own sign-in for this agent in a terminal, and say nothing more when one opened; when none opened, it shall show "Couldn't open a terminal. Run this, then choose Check again:" and the command to copy, and when the host couldn't be asked, why. The page shall keep the last answers for each agent, as each agent signs in on its own.

## Examples

- Given the agent runs in Halonic, then no strip shows, Halonic says "Built in. Needs nothing installed." and Claude Code says "Found Claude Code 1.0.0".
- Given the person picks Codex, then the agent's harness is saved as codex at once.
- Given the person picks Codex and the save fails, then Claude Code is picked again and no strip warns about Codex.
- Given the first check hasn't answered yet, then Claude Code and Codex each say "Checking…".
- Given the page showed "Codex isn't installed." once for Sorter, then the next visit to Sorter shows it at once while it asks the host again.
- Given Claude Code isn't installed and it is chosen, then the strip says "Sorter can't run until Claude Code is installed. · How to install", and Check again asks the host again.
- Given Codex is too old and chosen, then the strip says "Sorter can't run until Codex is updated. · How to update" and the option says which version Halonic needs.
- Given the host answers that the check failed with "No answer.", then the option says "Found Codex, but couldn't ask its version: No answer." and there is no strip.
- Given asking the host throws "The host didn't answer.", or there is no host to ask, then the option says "Couldn't check Codex: The host didn't answer." (never "Found Codex") and there is no strip.
- Given the chosen Codex isn't installed, then the page has one Check again, in the strip; once Halonic is chosen and the strip goes, the group's Check again is the one.
- Given the person picks a program that isn't installed, then the strip appears inside a status region that was already on the page, so it is read out.
- Given Sorter isn't signed in to Claude Code, then the strip says "Sorter can't run until it's signed in to Claude Code." with Sign in for this agent and Check again, and Sign in for this agent asks the host to open Claude Code's sign-in for Sorter.
- Given no terminal opened, then the strip says "Couldn't open a terminal. Run this, then choose Check again:" above the command and a Copy command button.
- Given the host couldn't be asked, then the strip says "Couldn't open the sign-in:" and the reason.
- Given Sorter is signed in, then there is no strip and no Sign in for this agent.
- Given focus is on the group's Check again and the check finds the chosen Codex missing, then focus is on the strip's Check again; given focus is on the strip's and the check finds Codex installed, then focus is on the group's. A check that doesn't change the strip leaves focus where it is.
