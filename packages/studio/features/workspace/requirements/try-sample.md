# workspace.try-sample

- Status: active
- Since: 0.1.0
- Source: flow-first-run 2.2, ux-checklists-t14-t15 part 2; HAL-1308

When the app gives the workspace window a sample host, the Welcome screen shall offer **Try the Acme sample**. When the host creates the sample, the window shall open its folder beside the others and show the toast "Created *name*", with the trust record's failure after it when it wasn't saved. If the host can't create it, then the window shall give Welcome the folder and reason, open nothing and show no toast.

## Examples

- Given the host creates `Acme sample`, then the window shows that workspace and the toast "Created Acme sample".
- Given the host says it can't write to Documents, then Welcome shows the reason and no workspace opens.
