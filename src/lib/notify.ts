import "server-only";
import { createComms } from "./comms";

const TELEGRAM_LIMIT = 4096;

/**
 * Sends a Telegram message to Kunal ("me") through the messaging service.
 * Best-effort: never throws, so a Telegram problem can't break adding a book or marking a quiz.
 * Skipped when COMMS_API_KEY isn't set (local development). Returns whether it was queued.
 */
export async function notifyTelegram(body: string, idempotencyKey: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
  const apiKey = process.env.COMMS_API_KEY;
  if (!apiKey) return false;
  try {
    await createComms({ apiKey }).send({
      channel: "telegram",
      to: "me",
      body: body.length > TELEGRAM_LIMIT ? `${body.slice(0, TELEGRAM_LIMIT - 1)}…` : body,
      metadata: { app: "reading-rocket", ...metadata },
      idempotency_key: idempotencyKey,
    });
    return true;
  } catch (err) {
    console.error("Telegram notification failed", idempotencyKey, err instanceof Error ? err.message : err);
    return false;
  }
}
