import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { signUp } from "@/lib/parent";

const SignUp = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  setupPin: z.string().max(100).default(""),
});

export async function POST(request: Request) {
  const parsed = SignUp.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
  }
  try {
    return NextResponse.json({ parent: await signUp(parsed.data) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
