# workspace.try-sample

- Status: active
- Since: unreleased
- Source: flow-first-run 2.2, ux-checklists-t14-t15 part 2; HAL-1308

When the app gives the workspace window a sample host, the Welcome screen shall offer **Try the Acme sample**. When the host creates the sample, the window shall open its folder beside the others and show the toast "Created *name*", with the trust record's failure after it when it wasn't saved. If the host can't create it, then the window shall give Welcome the folder and reason, open nothing and show no toast. The window shall remember on this device, in the folder's Recent entry, that it was created as the sample, and shall tell the host which folders those are, so that when the first taken sample folder is one of them the host reopens it and writes nothing. While a workspace is remembered as the sample and is trusted, the header shall show the chip "Sample · test model", a menu with the cost line, **New workspace…** and **Fresh copy of the sample**; before it is trusted the trust badge has the slot. **Fresh copy of the sample** shall ask the host for a copy with no known samples, open it beside the others and show "Created *name*. Your earlier copy is still in Recent."; if the host can't, it shall show the reason in a danger toast. When the served Studio on a phone serves the sample, More shall show the chip on its own line under the workspace row, and pressing it shall open a panel sheet titled "Sample · test model" with the cost line and "To start your own workspace, use Halonic on your computer.", with no New workspace and no Fresh copy.

## Examples

- Given the host creates `Acme sample`, then the window shows that workspace and the toast "Created Acme sample".
- Given the host says it can't write to Documents, then Welcome shows the reason and no workspace opens.
- Given `Acme sample` is remembered as a sample and is on disk, then Try the Acme sample reopens it with the toast "Opened Acme sample" and writes nothing.
- Given a sample is shown, then the chip "Sample · test model" is in the header; a workspace opened from Recent that is not a sample has none.
- Given Fresh copy makes `Acme sample 2`, then it opens and the toast says "Created Acme sample 2. Your earlier copy is still in Recent."
- Given the served Studio on a phone serves the sample, then More shows the chip under the workspace row, and pressing it opens a panel sheet with the cost line and "To start your own workspace, use Halonic on your computer."
- Given the served Studio on a phone serves another workspace, then More shows no chip.
