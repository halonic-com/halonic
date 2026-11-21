# std.unique-name

- Status: active
- Since: 0.1.0
- Source: `uniqueId` in the old Studio (`packages/core/app/src/studio.ts`) at 784f78d

When a name is already taken, the unique-name function shall add the first free number from 2 as `-2`, `-3` and so on; otherwise it shall keep the name. When asked to number every name, it shall add the first free number from 1, even when the name itself is free.

## Examples

- Given the base "report" and the taken names "inbox", when a unique name is made, then it is "report".
- Given the base "report" and the taken names "report", "report-2" and "report-4", when a unique name is made, then it is "report-3".
- Given the base "step", no taken names and numbering asked for, when a unique name is made, then it is "step-1".
- Given the base "step", the taken names "step-1" and "step-3" and numbering asked for, when a unique name is made, then it is "step-2".
