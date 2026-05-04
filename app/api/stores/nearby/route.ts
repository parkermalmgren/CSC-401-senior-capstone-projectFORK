import { NextRequest, NextResponse } from "next/server";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const RADIUS_M = 5000;

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { detail: "Query params lat and lng are required numbers." },
      { status: 400 }
    );
  }

  const query = `[out:json][timeout:20];(node(around:${RADIUS_M},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food)$"];way(around:${RADIUS_M},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food)$"];node(around:${RADIUS_M},${lat},${lng})["amenity"="marketplace"];);out center body;`;
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const text = await upstream.text();

    if (!upstream.ok) {
      return NextResponse.json(
        {
          detail: `Upstream store lookup failed (${upstream.status}).`,
          upstream_body: text.slice(0, 300),
        },
        { status: 502 }
      );
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { detail: "Invalid upstream response while loading stores." },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json(
      { detail: "Could not load nearby stores. Please try again." },
      { status: 502 }
    );
  }
}
