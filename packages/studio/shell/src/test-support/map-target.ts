import type { ServiceTarget } from "../service-catalog.ts";
import type { ServiceKey } from "../service-key.ts";

/** A minimal workspace registry for tests, shaped like the one in `@halonicjs/app`. */
export class MapTarget implements ServiceTarget {
  readonly provided: string[] = [];
  private readonly services = new Map<string, unknown>();

  provide<Service>(key: ServiceKey<Service>, service: Service): Service {
    if (this.services.has(key.name)) {
      throw new Error(`"${key.name}" is already provided.`);
    }
    this.services.set(key.name, service);
    this.provided.push(key.name);
    return service;
  }

  get<Service>(key: ServiceKey<Service>): Service {
    if (!this.services.has(key.name)) {
      throw new Error(`No service "${key.name}".`);
    }
    return this.services.get(key.name) as Service;
  }

  has(key: ServiceKey<unknown>): boolean {
    return this.services.has(key.name);
  }
}
