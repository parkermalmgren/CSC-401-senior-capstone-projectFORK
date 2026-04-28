import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const AUTH_BASE_PATH = process.env.BACKEND_AUTH_BASE_PATH || "";

// 24 hours — shorter than the previous 30-day cookie
const SESSION_MAX_AGE = 60 * 60 * 24;

function normalizeSegment(segment: string) {
  const trimmed = segment.trim();
  if (!trimmed) return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function buildCandidateAuthUrls(endpoint: "login" | "signup") {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const configuredPath = normalizeSegment(AUTH_BASE_PATH);

  const candidates = [
    `${base}${configuredPath}/auth/${endpoint}`,
    `${base}/auth/${endpoint}`,
    `${base}/api/auth/${endpoint}`,
    `${base}/api/src/main/auth/${endpoint}`,
  ];

  return [...new Set(candidates)];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const candidateUrls = buildCandidateAuthUrls("login");
    let backendRes: Response | null = null;
    let networkError: unknown = null;

    for (const candidateUrl of candidateUrls) {
      try {
        const res = await fetch(candidateUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        // Keep trying on 404 since this usually means path mismatch.
        if (res.status === 404) {
          backendRes = res;
          continue;
        }

        backendRes = res;
        break;
      } catch (error) {
        networkError = error;
      }
    }

    if (!backendRes) {
      throw networkError ?? new Error("Unable to reach auth backend");
    }

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    const response = NextResponse.json(data);

    // HttpOnly prevents JS from reading this cookie (blocks XSS token theft)
    response.cookies.set("sp_session", data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    // Hint cookie — readable by JS so the Navbar can detect auth state
    response.cookies.set("sp_session_exists", "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { detail: "An internal error occurred. Please try again." },
      { status: 500 }
    );
  }
}
