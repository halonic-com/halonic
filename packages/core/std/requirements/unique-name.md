# std.unique-name

- Status: active
- Since: 0.1.0
- Source: `uniqueId` in the old Studio (`packages/core/app/src/studio.ts`) at 784f78d

When a name is already taken, the unique-name function shall add the first free number from 2 as `-2`, `-3` and so on; otherwise it shall keep the name.

## Examples

- Given the base "report" and the taken names "inbox", when a unique name is made, then it is "report".
- Given the base "report" and the taken names "report", "report-2" and "report-4", when a unique name is made, then it is "report-3".
