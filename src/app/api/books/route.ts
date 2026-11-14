import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { addBook, listBooks } from "@/lib/service";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ books: await listBooks() });
  } catch (err) {
    return errorResponse(err);
  }
}

const NewBook = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200).optional().transform((a) => a || null),
  finished_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  const parsed = NewBook.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please enter a title and date." }, { status: 400 });
  try {
    return NextResponse.json({ book: await addBook(parsed.data) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
