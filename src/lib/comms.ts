/**
 * Comms client: email + Telegram messages with buttons, replies and webhooks.
 * One file, no dependencies, Node 18+ (global fetch). Docs: https://kunalgalav.com/messaging_service/agents.md
 *
 *   curl -fsSo src/comms.ts https://kunalgalav.com/messaging_service/sdk/comms.ts
 *
 *   import { comms } from "./comms";   // reads COMMS_API_KEY (and optional COMMS_BASE_URL)
 *   await comms.send({ channel: "telegram", to: "me", body: "Backup done", idempotency_key: "backup-2026-11-16" });
 *
 * Never print, log or commit the API key or webhook secret.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const COMMS_SDK_VERSION = "1.0.0";

export type Button = { id: string; label: string };
type Common = {
  to: string;
  buttons?: Button[];
  /** Your own context (up to 4 KB of JSON). Comes back on the message and in every event. */
  metadata?: Record<string, unknown>;
  /** Names the event, e.g. "backup-failed-2026-11-16". Repeats within 7 days return the original message. */
  idempotency_key?: string;
};
export type SendInput =
  | (Common & { channel: "telegram"; body: string; subject?: string })
  | (Common & { channel: "email"; subject: string; body: string; html?: string });

export type MessageStatus = "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "received";

export type CommsMessage = {
  id: string;
  channel: "email" | "telegram";
  direction: "outbound" | "inbound";
  to: string;
  from?: string;
  subject?: string;
  body: string;
  status: MessageStatus;
  error?: string;
  buttons?: Button[];
  response?: { button_id: string; label: string; contact_id?: string; at: string };
  in_reply_to?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TelegramLink = { contact_id: string; url: string; expires_at: string; already_linked: boolean };

/** A webhook event. Delivery is at-least-once: skip ids you've already handled. */
export type CommsEvent = {
  id: string;
  type: "message.status" | "button.clicked" | "message.received";
  app_id: string;
  created_at: string;
  data: {
    /** The message the event is about (for message.received: the inbound reply). */
    message: CommsMessage;
    /** button.clicked: the chosen button. */
    button?: Button;
    /** message.received: the outbound message being replied to, with its metadata. */
    in_reply_to?: CommsMessage;
  };
};

/** An API error. `code` is the API's error code, e.g. "rate_limited" or "contact_not_linked". */
export class CommsError extends Error {
  override name = "CommsError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    /** Seconds to wait before retrying (429 only). */
    readonly retryAfter?: number,
  ) {
    super(`comms ${status} ${code}: ${message}`);
  }
}

export interface CommsOptions {
  /** Defaults to process.env.COMMS_API_KEY. */
  apiKey?: string;
  /** Defaults to process.env.COMMS_BASE_URL, then https://api.kunalgalav.com. */
  baseUrl?: string;
  /** Retries for 429, 5xx and network errors. Sends are only retried on 5xx/network when they have an idempotency_key. Default 3. */
  maxRetries?: number;
  /** Per-request timeout. Default 15 s. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createComms(options: CommsOptions = {}) {
  const env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {};
  const baseUrl = (options.baseUrl ?? env.COMMS_BASE_URL ?? "https://api.kunalgalav.com").replace(/\/$/, "");
  const maxRetries = options.maxRetries ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? wait;

  async function request<T>(method: string, path: string, body?: unknown, retrySafe = true): Promise<T> {
    const apiKey = options.apiKey ?? env.COMMS_API_KEY;
    if (!apiKey) throw new CommsError(0, "no_api_key", "COMMS_API_KEY is not set");
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}${path}`, {
          method,
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (retrySafe && attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new CommsError(0, "network_error", (err as Error).message);
      }
      const data = (await res.json().catch(() => ({}))) as T & {
        error?: { code: string; message: string; details?: unknown };
      };
      if (res.ok) return data;

      const retryAfter = Number(res.headers.get("retry-after")) || undefined;
      const err = new CommsError(
        res.status,
        data.error?.code ?? "http_error",
        data.error?.message ?? res.statusText,
        data.error?.details,
        retryAfter,
      );
      // A 429 means nothing was created, so it's always safe to retry, if the wait is short.
      const retryable =
        (res.status === 429 && (retryAfter ?? 1) <= 60) || (res.status >= 500 && retrySafe);
      if (!retryable || attempt >= maxRetries) throw err;
      await sleep(res.status === 429 ? (retryAfter ?? 1) * 1000 : backoff(attempt));
    }
  }

  const client = {
    /** Queues a message. Resolves with status "queued" (not yet delivered). */
    send(input: SendInput): Promise<CommsMessage> {
      return request<CommsMessage>("POST", "/v1/messages", input, Boolean(input.idempotency_key));
    },

    get(id: string): Promise<CommsMessage> {
      return request<CommsMessage>("GET", `/v1/messages/${encodeURIComponent(id)}`);
    },

    /** A one-time link (valid 7 days) that connects a contact's Telegram chat. */
    telegramLink(contactId: string): Promise<TelegramLink> {
      return request<TelegramLink>("POST", "/v1/contacts/telegram-link", { contact_id: contactId });
    },

    /**
     * Sends a message with buttons and polls until someone answers.
     * Returns the chosen button id, or null on timeout or if the message failed.
     */
    async ask(
      input: SendInput & { buttons: Button[] },
      opts: { timeoutMs?: number; pollMs?: number } = {},
    ): Promise<string | null> {
      const sent = await client.send(input);
      const until = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
      const pollMs = opts.pollMs ?? 5_000;
      for (;;) {
        const m = await client.get(sent.id);
        if (m.response) return m.response.button_id;
        if (m.status === "failed" || m.status === "bounced" || m.status === "complained") return null;
        if (Date.now() + pollMs > until) return null;
        await sleep(pollMs);
      }
    },

    /** Waits until a message leaves "queued" (or the timeout passes) and returns it. */
    async waitForStatus(id: string, opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<CommsMessage> {
      const until = Date.now() + (opts.timeoutMs ?? 60_000);
      const pollMs = opts.pollMs ?? 2_000;
      for (;;) {
        const m = await client.get(id);
        if (m.status !== "queued" || Date.now() + pollMs > until) return m;
        await sleep(pollMs);
      }
    },
  };
  return client;
}

/** Default client, configured from COMMS_API_KEY / COMMS_BASE_URL. */
export const comms = createComms();

/**
 * Checks an incoming webhook. Pass the RAW request body (not re-serialised JSON)
 * and the `x-comms-signature` header. Returns the parsed event, or null if it's not genuine.
 */
export function verifyWebhook(
  secret: string,
  signatureHeader: string | null | undefined,
  rawBody: string,
  nowMs = Date.now(),
): CommsEvent | null {
  if (!signatureHeader) return null;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1 ?? "";
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(v1)) return null;
  if (Math.abs(nowMs / 1000 - t) > 300) return null;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  if (!timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) return null;
  try {
    return JSON.parse(rawBody) as CommsEvent;
  } catch {
    return null;
  }
}

function backoff(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
