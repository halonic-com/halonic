# Decision: register the plugin manifest as a file kind

- Approval: the HAL-1734 plan, approved by the maintainer on HAL-1865, reworked to the accepted plugins ADR (halonic#524)
- Kind: internal

The plugins ADR adds `plugin.yaml`, a new file kind. Like the integration
sheet it sits outside workspaces, so the registry lists it last, after
`integration`, with no place.

- `format.kind-registry` grows: it now names the two kinds that sit outside
  workspaces, the integration sheet and the plugin manifest. Nothing it
  promised before is taken away, and its test still checks every kind.
- The plugin kind's JSON Schema spec file is new, written with
  `SPEC_WRITE=1` like the other kinds' spec files.
- The `halonic schema` command's golden grows by one file: the command
  writes a schema for every kind, so it now writes 16, with
  `plugin.schema.json` among them. Nothing else in that golden changes.

No test was weakened.

## Covers

- format.kind-registry
- packages/core/format/spec/plugin.schema.json
- apps/cli/src/commands/schema/golden/schema-output.json
