import { NextResponse } from "next/server";
import { isParent } from "@/lib/parent";
import { errorResponse, parentOnly } from "@/lib/http";
import { latestRubric, regenerateRubric } from "@/lib/service";

export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ rubric: await latestRubric() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST() {
  if (!(await isParent())) return parentOnly();
  try {
    return NextResponse.json({ rubric: await regenerateRubric() });
  } catch (err) {
    return errorResponse(err);
  }
}
