import { NextResponse } from "next/server";
import { z } from "zod";
import { isParent } from "@/lib/parent";
import { errorResponse, parentOnly } from "@/lib/http";
import { deleteBook, getBook, setWords } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const book = await getBook(Number((await params).id));
    return book ? NextResponse.json({ book }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}

const Patch = z.object({ words: z.number().int().min(0).max(2_000_000) });

export async function PATCH(request: Request, { params }: Ctx) {
  if (!(await isParent())) return parentOnly();
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a whole number of words." }, { status: 400 });
  try {
    const book = await setWords(Number((await params).id), parsed.data.words);
    return book ? NextResponse.json({ book }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  if (!(await isParent())) return parentOnly();
  try {
    await deleteBook(Number((await params).id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
