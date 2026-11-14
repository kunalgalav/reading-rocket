import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { AgentError } from "./agents";
import { QuizError } from "./service";

/** Turn thrown errors into kid-safe JSON responses, keeping details in the server log. */
export function errorResponse(err: unknown) {
  if (err instanceof QuizError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof AgentError) return NextResponse.json({ error: err.message }, { status: 502 });
  if (err instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: "Claude is busy. Please try again in a minute." }, { status: 429 });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    console.error("Anthropic authentication failed: check ANTHROPIC_API_KEY");
    return NextResponse.json({ error: "The app isn't set up correctly (API key)." }, { status: 500 });
  }
  if (err instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${err.status}`, err.message);
    return NextResponse.json({ error: "Claude had a problem. Please try again." }, { status: 502 });
  }
  if (err instanceof Anthropic.AnthropicError) {
    // Client-side SDK error, most often no credentials configured.
    console.error("Anthropic client error", err.message);
    return NextResponse.json({ error: "The app isn't set up correctly (API key)." }, { status: 500 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export const parentOnly = () => NextResponse.json({ error: "Parent PIN required" }, { status: 403 });
