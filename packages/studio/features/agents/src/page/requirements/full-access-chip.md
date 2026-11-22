# agents.page.full-access-chip

- Status: draft
- Since: unreleased
- Source: HAL-4295, HAL-1709 (ux-checklists-sandbox 3.8); microcopy 23.1 and 23.4 (placeholders until HAL-1784); HAL-15539 (visual check C592: attention tone); flow check C605 on HAL-15640

While On this computer is chosen for the agent on this computer, the agents feature shall show the `Full access` chip, in the attention tone (amber) with the shield, in the agent page's header, read by a screen reader as running without the sandbox. While that choice is on hold because the agent's file changed, the chip shall stay, in neutral tone with the shield, as `Full access on hold`, read by a screen reader as running in the sandbox until the person confirms again. The chip shall follow a choice made in Where it runs at once, and be read again when a file changes. While the agent runs in its sandbox, where the host can't say where it runs, and when that can't be read, the header shall show no chip.

## Examples

- Given Writer runs in its sandbox, then its header has no chip.
- Given On this computer is chosen for Writer, then its header shows `Full access`, which a screen reader hears as "Runs without the sandbox".
- Given that choice, when Writer's file is saved with a change, then the chip says `Full access on hold` in neutral tone, and a screen reader hears that it runs in the sandbox until you confirm again.
- Given the person confirms On this computer in Where it runs, then the chip shows at once; when they pick In a sandbox, it goes.
- Given a host that can't say where agents run, or a read that fails, then there is no chip.
