import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Family passcode gate. Keeps strangers off the site (and off the API bill).
export async function middleware(request: NextRequest) {
  const passcode = process.env.FAMILY_PASSCODE;
  if (!passcode) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("FAMILY_PASSCODE is not configured.", { status: 503 });
    }
    return NextResponse.next(); // local dev without a passcode
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(passcode))) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|api/health|_next/static|_next/image|favicon.ico).*)"],
};
