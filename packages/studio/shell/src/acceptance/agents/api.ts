// The public interface of the stub agents feature: what other features may import.
import { serviceKey } from "../../service-key.ts";

/** Lists the agents of the open workspace. */
export interface AgentsApi {
  names(): readonly string[];
}

/** The key other features list in `needs` to use the agents service. */
export const AgentsService = serviceKey<AgentsApi>("agents");
