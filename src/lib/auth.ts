// Shared by middleware (edge runtime) and route handlers: uses Web Crypto only.

export const SESSION_COOKIE = "family_session";

/** Cookie value = SHA-256 of the passcode, so the passcode itself is never stored in the browser. */
export async function sessionToken(passcode: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`reading-tracker:${passcode}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
