// Shared by middleware (edge runtime) and route handlers: uses Web Crypto only.

export const SESSION_COOKIE = "family_session";

/** Cookie value = SHA-256 of the passcode, so the passcode itself is never stored in the browser. */
export async function sessionToken(passcode: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`reading-tracker:${passcode}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parent-only actions (editing words, regenerating the methodology) send the PIN in a header. */
export function isParent(request: Request): boolean {
  const pin = process.env.PARENT_PIN;
  if (!pin) return process.env.NODE_ENV !== "production"; // open locally, locked if unset in production
  return request.headers.get("x-parent-pin") === pin;
}
