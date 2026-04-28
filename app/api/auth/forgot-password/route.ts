import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const AUTH_BASE_PATH = process.env.BACKEND_AUTH_BASE_PATH || "";

function normalizeSegment(segment: string) {
  const trimmed = segment.trim();
  if (!trimmed) return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function buildCandidateAuthUrls() {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const configuredPath = normalizeSegment(AUTH_BASE_PATH);

  const candidates = [
    `${base}${configuredPath}/auth/forgot-password`,
    `${base}/auth/forgot-password`,
    `${base}/api/auth/forgot-password`,
    `${base}/api/src/main/auth/forgot-password`,
  ];

  return [...new Set(candidates)];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const frontendOrigin = req.nextUrl.origin.replace(/\/+$/, "");
    const payload = {
      ...body,
      redirect_to: `${frontendOrigin}/reset-password`,
    };
    const candidateUrls = buildCandidateAuthUrls();
    let backendRes: Response | null = null;
    let networkError: unknown = null;

    for (const candidateUrl of candidateUrls) {
      try {
        const res = await fetch(candidateUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

    const raw = await backendRes.text();
    let data: Record<string, unknown> = {};

    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      if (!backendRes.ok) {
        data = {
          detail: `Backend returned ${backendRes.status} ${backendRes.statusText}`,
          backend_body: raw.slice(0, 300),
        };
      }
    }

    if (backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    const detail =
      typeof data.detail === "string" && data.detail.trim()
        ? data.detail
        : `Backend returned ${backendRes.status} ${backendRes.statusText}`;

    return NextResponse.json(
      {
        ...data,
        detail,
        backend_status: backendRes.status,
      },
      { status: backendRes.status }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail: "An internal error occurred. Please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
