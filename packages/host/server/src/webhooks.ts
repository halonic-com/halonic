import type { RoutineTrigger } from "@halonicjs/format";
import { workspaceSecrets } from "@halonicjs/ports";
import { type PlacedRoutine, routineStart, webhookFacts } from "@halonicjs/routines";
import type { ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { refuseUnlessTrusted } from "./trust-routes.ts";

/** Every webhook address starts with this, then `<hubId or @workspace>/<routineId>`. */
export const webhookPathPrefix = "/api/webhooks/";

/** How far a request's timestamp may be from the server's clock, in either direction. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * How long a delivery id is remembered. A request with a timestamp at the edge
 * of the window may arrive up to a full window early and be valid for a full
 * window after, so two windows cover every moment it could be replayed.
 */
const deliveryMemoryMs = 2 * WEBHOOK_TOLERANCE_SECONDS * 1000;

const pathSegment = /^[@A-Za-z0-9._-]{1,128}$/;
const deliveryIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const timestampPattern = /^[0-9]{1,12}$/;
const signaturePattern = /^sha256=([0-9a-f]{64})$/;

const signatureHeader = "x-halonic-signature";
const timestampHeader = "x-halonic-timestamp";
const deliveryHeader = "x-halonic-delivery";

/** The webhook route. */
export interface WebhookRoutes {
  /**
   * `POST /api/webhooks/<hub>/<routine>`: starts the routine that has a
   * webhook trigger at that address, for a request signed with its secret.
   *
   * @param address What follows {@link webhookPathPrefix}.
   */
  receive(request: Request, address: string, body: Uint8Array): Promise<Response>;
}

type WebhookPorts = Pick<
  ServerPorts,
  "webhooks" | "secrets" | "coordination" | "trust" | "runs" | "clock"
>;

export function createWebhookRoutes(ports: WebhookPorts): WebhookRoutes {
  const { webhooks, coordination, trust, runs, clock } = ports;
  const secrets = workspaceSecrets(ports.secrets);

  /**
   * Every reason to refuse before the signature is proven gets this one
   * answer, so a caller who can't sign learns nothing: not whether a routine
   * exists, is switched off, or has its secret set.
   */
  const rejected = () => errorResponse(serverErrors.webhookRejected);

  /**
   * The routine and the signing headers of a request whose signature is
   * proven, or `null` for any request that can't prove it: the routine is
   * missing, off or not a webhook, its secret is unusable, a header is
   * missing, the time is off, or the signature is wrong.
   */
  async function proveSender(
    request: Request,
    address: string,
    body: Uint8Array,
  ): Promise<ProvenSender | null> {
    const key = routineKeyOf(address);
    const placed = key === null ? null : await webhooks.find(key);
    if (key === null || placed === null || !placed.routine.enabled) {
      return null;
    }
    const { trigger } = placed.routine;
    if (!("webhook" in trigger)) {
      return null;
    }
    const secret = await readSecret(secrets, trigger.webhook.secret);
    const signed = readSigned(request);
    const now = clock.now();
    if (
      secret === null ||
      signed === null ||
      !isWithinWindow(signed.timestamp, now) ||
      !(await signatureMatches(secret, signed, body))
    ) {
      return null;
    }
    return { key, placed, trigger, signed, now };
  }

  return {
    async receive(request, address, body) {
      const sender = await proveSender(request, address, body);
      if (sender === null) {
        return rejected();
      }

      // The sender is proven from here on, so the answers may say more.
      const untrusted = await refuseUnlessTrusted(trust);
      if (untrusted !== null) {
        return untrusted;
      }
      const { key, placed, trigger, signed, now } = sender;
      const facts = webhookFacts(trigger, {
        at: now,
        body: new TextDecoder().decode(body),
        headers: Object.fromEntries(request.headers),
      });
      const start = routineStart(placed, facts);
      if (start.hub === null) {
        throw new Error(`Routine ${key} runs outside a hub, so it must name one in run.hub.`);
      }
      const delivery = await sha256Hex(`${key}\n${signed.deliveryId}`);
      const lease = await coordination.tryAcquire(`webhook-delivery:${delivery}`, deliveryMemoryMs);
      if (lease === null) {
        return errorResponse(serverErrors.webhookReplayed);
      }
      const runTrigger = {
        type: "webhook",
        routineId: key,
        at: now.toISOString(),
        deliveryId: signed.deliveryId,
      } as const;
      // The same delivery always gets the same run id, so the executor itself starts nothing twice.
      const runId = `webhook-${delivery}`;
      try {
        const summary =
          "workflow" in start
            ? await runs.start({
                hubId: start.hub,
                workflowId: start.workflow,
                input: start.input,
                trigger: runTrigger,
                runId,
              })
            : await runs.startAgent({
                hubId: start.hub,
                agentId: start.agent,
                prompt: start.prompt,
                trigger: runTrigger,
                runId,
              });
        return Response.json({ runId: summary.id }, { status: 202 });
      } catch (error) {
        // A start that failed must not use up the delivery: the sender's retry should get through.
        await coordination.release(lease);
        throw error;
      }
    },
  };
}

/** `<scope>/<routine>` from the address, or `null` when it isn't exactly two plain segments. */
function routineKeyOf(address: string): string | null {
  const parts = address.split("/");
  const [scope, routine] = parts;
  if (parts.length !== 2 || !pathSegment.test(scope ?? "") || !pathSegment.test(routine ?? "")) {
    return null;
  }
  return address;
}

/**
 * The secret's value, or `null` when it isn't set (or is empty) or the routine may not use
 * it: a routine file that names one of Halonic's own secrets or a plugin's
 * gets nothing, the same as an unset one.
 */
async function readSecret(
  secrets: ReturnType<typeof workspaceSecrets>,
  name: string,
): Promise<string | null> {
  try {
    // An empty value is no secret: it can't key an HMAC, and a signature made with it would prove nothing.
    const value = await secrets.get(name);
    return value === "" ? null : value;
  } catch (error) {
    if (error instanceof RangeError) {
      return null;
    }
    throw error;
  }
}

interface ProvenSender {
  readonly key: string;
  readonly placed: PlacedRoutine;
  readonly trigger: RoutineTrigger;
  readonly signed: SignedRequest;
  readonly now: Date;
}

interface SignedRequest {
  readonly signature: Uint8Array<ArrayBuffer>;
  readonly timestamp: number;
  readonly timestampText: string;
  readonly deliveryId: string;
}

/** The three signing headers, or `null` when one is missing or malformed. */
function readSigned(request: Request): SignedRequest | null {
  const signature = signaturePattern.exec(request.headers.get(signatureHeader) ?? "")?.[1];
  const timestampText = request.headers.get(timestampHeader) ?? "";
  const deliveryId = request.headers.get(deliveryHeader) ?? "";
  if (
    signature === undefined ||
    !timestampPattern.test(timestampText) ||
    !deliveryIdPattern.test(deliveryId)
  ) {
    return null;
  }
  return {
    signature: fromHex(signature),
    timestamp: Number(timestampText),
    timestampText,
    deliveryId,
  };
}

function isWithinWindow(timestamp: number, now: Date): boolean {
  return Math.abs(now.getTime() / 1000 - timestamp) <= WEBHOOK_TOLERANCE_SECONDS;
}

/**
 * Checks the HMAC-SHA-256 of `<delivery id>.<timestamp>.<body>`. Signing the
 * id and the timestamp with the body means a captured request can't be sent
 * again under a new id or time. `crypto.subtle.verify` compares in constant time.
 */
async function signatureMatches(
  secret: string,
  signed: SignedRequest,
  body: Uint8Array,
): Promise<boolean> {
  const prefix = new TextEncoder().encode(`${signed.deliveryId}.${signed.timestampText}.`);
  const message = new Uint8Array(new ArrayBuffer(prefix.length + body.length));
  message.set(prefix);
  message.set(body, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signed.signature, message);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}
