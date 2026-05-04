import { NextRequest, NextResponse } from "next/server";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ detail: "Query param q is required." }, { status: 400 });
  }

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        // Nominatim requests an identifying User-Agent for fair usage.
        "User-Agent": "SmartPantry/1.0 (capstone project)",
      },
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json(
        {
          detail: `Upstream geocoding failed (${upstream.status}).`,
          upstream_body: text.slice(0, 300),
        },
        { status: 502 }
      );
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : [];
    } catch {
      return NextResponse.json(
        { detail: "Invalid upstream response while geocoding." },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ detail: "Search failed. Please try again." }, { status: 502 });
  }
}
