import { checkSecretValue, type SecretStore, secretKey } from "@halonicjs/ports";

/**
 * A small in-memory `SecretStore` for the kernel's own tests. A deliberate
 * fake: core may not use adapters, not even in tests. It keeps the port's
 * rules, which its own contract test pins.
 */
export class TestSecretStore implements SecretStore {
  private readonly saved = new Map<string, { name: string; value: string }>();

  async get(name: string): Promise<string | null> {
    return this.saved.get(secretKey(name))?.value ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    const key = secretKey(name);
    checkSecretValue(value);
    this.saved.set(key, { name, value });
  }

  async remove(name: string): Promise<void> {
    this.saved.delete(secretKey(name));
  }

  async names(): Promise<readonly string[]> {
    const keys = [...this.saved.keys()].sort();
    return keys.map((key) => this.saved.get(key)?.name ?? key);
  }
}
