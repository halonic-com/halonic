/**
 * Names a service and carries its type, so a lookup returns the right type
 * without a cast. Features list keys in `needs` and `provides`.
 *
 * The shape matches `ServiceKey` in `@halonicjs/app`, so keys made there fit
 * here unchanged. This copy goes once that package exports its own.
 */
export interface ServiceKey<Service> {
  readonly name: string;
  /** Never set; only carries the type. */
  readonly type?: Service;
}

/**
 * Makes a key for a service. Export it from the `api.ts` of the feature that
 * provides the service.
 *
 * @example
 * export const AgentsService = serviceKey<AgentsApi>("agents");
 */
export function serviceKey<Service>(name: string): ServiceKey<Service> {
  return { name };
}
