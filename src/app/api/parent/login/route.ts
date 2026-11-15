import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { logIn } from "@/lib/parent";

const LogIn = z.object({ email: z.string().max(200), password: z.string().max(200) });

export async function POST(request: Request) {
  const parsed = LogIn.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  try {
    return NextResponse.json({ parent: await logIn(parsed.data.email, parsed.data.password) });
  } catch (err) {
    return errorResponse(err);
  }
}
