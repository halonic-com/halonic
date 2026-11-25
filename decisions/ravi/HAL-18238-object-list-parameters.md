# Decision: tool files may declare object and list parameters

- Approval: Liam's decision on HAL-18194 (25 Nov) and his note 1 on halonic-com/halonic#5967, tracked on HAL-18238. Liam approves this note in review of this PR.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TfcKdhnmh8PoY6ls1FZvJ3n2g6mzFc0Ljdh6xIFLaZKo9jVpAs59SYEpDV3sjooDTt0bM6WLWSYB/wQIzzzcBQ==

`format.tool-file` said each parameter has one flat type, and its example
refused `type: object`. `paperclip.next-step` reads `monitor` as an object
and `blockedBy` as a list, and `paperclip.finish-run` reads `blockedBy` as a
list, so no tool file could offer them. The requirement now also takes a
`type: object` parameter with 1 to 16 flat `fields`, and a `type: list`
parameter with flat `items` and `maxItems` (1 to 100, default 20); nothing
nests deeper. The test that refused `type: object` now refuses an object
without fields, a list without items and anything nested deeper.

`plugin-build.manifest` gains the matching rule: an object parameter becomes
an object schema of its fields (required ones listed, no others allowed), a
list parameter an `array` of its items. Flat parameters are written as
before, so an existing plugin builds to the same bytes.

The new checks (`parameter-optional`, `parameter-type`, and the object's
fields checked like parameters) are in the new requirement
`format.tool-parameter-shapes`; they only refuse more. None of this is
released yet.

Since HAL-18229 (#5989) the runtime also reads `blockedBy` as one text with
commas and reads the flat `monitorInMinutes`, `monitorRef`, `monitorService`
and `monitorMaxChecks`. So `blockedBy`'s list shape carries `orText`, and
`parameter-type` takes it declared as a list of strings or as a string; the
requirement has an example for the string form. The flat `monitor…`
parameters stay flat, as #5989 left them.

The format's generated JSON Schemas, `spec/tool.schema.json` and
`spec/workspace-snapshot.schema.json`, change to match: each parameter's
`oneOf` gains the object and list choices. The flat choices keep the same
rules, with their keys listed in another order, so no file that was valid
before is refused.

## Covers

- format.tool-file
- plugin-build.manifest
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
