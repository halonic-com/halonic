# agents.page.full-access-chip

- Status: draft
- Since: unreleased
- Source: HAL-4295, HAL-1709 (ux-checklists-sandbox 3.8); microcopy 23.1 and 23.4 (placeholders until HAL-1784); HAL-15539 (visual check C592: attention tone); HAL-15552 (no chip while on hold)

While the agent runs on this computer without the sandbox, the agents feature shall show the `Full access` chip, in the attention tone (amber) with the shield, in the agent page's header, read by a screen reader as running without the sandbox. The chip shall follow a choice made in Where it runs at once, and be read again when a file changes. While the agent runs in its sandbox, including while On this computer is on hold because the agent's file changed, where the host can't say where it runs, and when that can't be read, the header shall show no chip.

## Examples

- Given Writer runs in its sandbox, then its header has no chip.
- Given On this computer is chosen for Writer, then its header shows `Full access`, which a screen reader hears as "Runs without the sandbox".
- Given that choice, when Writer's file is saved with a change, then the choice is on hold, Writer runs in its sandbox and the chip goes.
- Given the person confirms On this computer in Where it runs, then the chip shows at once; when they pick In a sandbox, it goes.
- Given a host that can't say where agents run, or a read that fails, then there is no chip.
