import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Reads the HttpOnly session cookie server-side and returns the token to the
 * same-origin client. This allows the frontend to re-hydrate its in-memory
 * token after a page refresh without exposing the cookie to document.cookie.
 */
export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("sp_session");

  if (!session?.value) {
    return NextResponse.json({ token: null }, { status: 401 });
  }

  return NextResponse.json({ token: session.value });
}
