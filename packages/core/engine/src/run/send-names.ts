import type { SendOptions } from "@halonicjs/ports";

/**
 * What a send names, field by field, so that an option the port adds later
 * isn't passed to the engine without a decision. Fields left out stay out.
 */
export function sendNames(options: SendOptions | undefined) {
  return {
    ...(options?.callId === undefined ? {} : { callId: options.callId }),
    ...(options?.wait === undefined ? {} : { wait: options.wait }),
    ...(options?.by === undefined ? {} : { by: options.by }),
  };
}
