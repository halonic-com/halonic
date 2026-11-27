import { shippedCatalog } from "@halonicjs/action-catalog";
import type { ServiceRegistry } from "@halonicjs/app";
import {
  ActionCatalogService,
  defaultRequesterPolicy,
  RequesterPolicyService,
} from "@halonicjs/studio-feature-action-steppers/api";

/**
 * Gives the Inbox what an agent's action request is checked against when it opens: the catalog
 * of reviewed steppers this Halonic ships, and the requester policy. The profile holds no policy
 * yet (HAL-17529), so the default holds: anyone may ask for routine steppers and nobody for more.
 */
export function provideActionSteppers(services: ServiceRegistry): void {
  services.provide(ActionCatalogService, shippedCatalog);
  services.provide(RequesterPolicyService, defaultRequesterPolicy);
}
