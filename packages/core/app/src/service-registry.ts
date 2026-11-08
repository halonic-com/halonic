/**
 * Names a service and carries its type, so `get` returns the right type
 * without a cast at the call site. Create one per service with
 * {@link serviceKey} and export it from the package that owns the service.
 */
export interface ServiceKey<Service> {
  readonly name: string;
  /** Never set; only carries the type. */
  readonly type?: Service;
}

/**
 * Makes a key for a service.
 *
 * @example
 * export const routineSchedulerKey = serviceKey<RoutineScheduler>("routines.scheduler");
 */
export function serviceKey<Service>(name: string): ServiceKey<Service> {
  return { name };
}

/** A service that holds something to let go of when its workspace closes. */
export interface Disposable {
  /**
   * Lets go of what the service holds. Resolve only when nothing of this
   * service is still running: the services it was built on are disposed
   * right after it.
   */
  dispose(): void | Promise<void>;
}

function isDisposable(value: unknown): value is Disposable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<Disposable>).dispose === "function"
  );
}

/** Thrown for a service that is missing, provided twice, or provided after the registry was disposed. */
export class ServiceError extends Error {
  override name = "ServiceError";
}

/**
 * The services of one open workspace, by key. Each is provided once. When
 * the registry is disposed, every service that has a `dispose` method gets
 * it, in the reverse order they were provided, so a service goes before the
 * ones it was built on.
 */
export class ServiceRegistry {
  private readonly services = new Map<string, unknown>();
  private disposed = false;

  /**
   * Adds a service.
   *
   * @throws ServiceError when a service with the same key name is already
   *   there, or the registry was disposed
   */
  provide<Service>(key: ServiceKey<Service>, service: Service): Service {
    if (this.disposed) {
      // Such as a feature that finished loading after its workspace closed.
      throw new ServiceError(
        `The service "${key.name}" can't be provided: the workspace is closed.`,
      );
    }
    if (this.services.has(key.name)) {
      throw new ServiceError(`The service "${key.name}" is already provided.`);
    }
    this.services.set(key.name, service);
    return service;
  }

  /**
   * The service for a key.
   *
   * @throws ServiceError when nothing provides it
   */
  get<Service>(key: ServiceKey<Service>): Service {
    if (!this.services.has(key.name)) {
      throw new ServiceError(`No service "${key.name}" in this workspace.`);
    }
    return this.services.get(key.name) as Service;
  }

  /** Whether something provides the key. */
  has(key: ServiceKey<unknown>): boolean {
    return this.services.has(key.name);
  }

  /**
   * Disposes every service, newest first, and empties the registry; it
   * accepts no new services afterwards. A service whose `dispose` fails
   * doesn't stop the others.
   *
   * @throws the one error, or an `AggregateError`, after all services had their turn
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    const newestFirst = [...this.services.values()].reverse();
    this.services.clear();
    const errors: unknown[] = [];
    for (const service of newestFirst) {
      if (!isDisposable(service)) {
        continue;
      }
      try {
        await service.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} services failed to dispose.`);
    }
  }
}
