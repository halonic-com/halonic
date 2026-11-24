// The public API of @halonicjs/format/connector: what a connector's `tools`
// settings decide, for code that reads no YAML, such as the Worker. It must
// not import `yaml`, even indirectly; connector-entry.test.ts checks that.

export {
  asksBeforeEachUse,
  type Connector,
  marksRead,
  needsApproval,
} from "../kinds/connector/schema.ts";
export { connectorIsLocalWith, type SheetHosts } from "../kinds/connector/sheet-hosts.ts";
