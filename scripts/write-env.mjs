// Used by amplify.yml at build time: reads the app's secret (JSON object of KEY: value)
// from stdin and writes it to .env.production, which Next.js loads on the server at runtime.
// Never prints values. `$` is escaped because Next.js expands $VARS inside .env files.
import { readFileSync, writeFileSync } from "node:fs";

const secret = JSON.parse(readFileSync(0, "utf8"));
const lines = Object.entries(secret).map(([key, value]) => {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Bad key in secret: ${key}`);
  const text = String(value);
  // Next's .env parser can't round-trip these characters, so fail the build rather than corrupt a value.
  if (/["\\\n\r]/.test(text)) throw new Error(`${key} contains a quote, backslash or newline; please choose another value.`);
  return `${key}="${text.replace(/\$/g, "\\$")}"`;
});
writeFileSync(".env.production", lines.join("\n") + "\n", { mode: 0o600 });
console.log(`Wrote .env.production with ${lines.length} settings: ${Object.keys(secret).join(", ")}`);
