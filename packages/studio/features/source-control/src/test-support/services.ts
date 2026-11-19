import type { ServiceKey, ServiceTarget } from "@halonicjs/studio-shell";

/** One open workspace's services, as the app keeps them: what a test's shell instantiates into. */
export class WorkspaceServices implements ServiceTarget {
  readonly #services = new Map<string, unknown>();

  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.#services.set(key.name, service);
  }

  get<Service>(key: ServiceKey<Service>): Service {
    return this.#services.get(key.name) as Service;
  }

  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.name);
  }
}
