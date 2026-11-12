/**
 * The services and types other features may use. Features import each
 * other only through this file.
 */
export {
  type ConnectionState,
  type ConnectionTone,
  type ConnectorFacts,
  connectionStateOf,
  connectionStateTable,
} from "./connection-state.ts";
export {
  type ConnectorStatus,
  type ConnectorStatusHost,
  ConnectorStatusHostService,
} from "./connector-status-host.ts";
