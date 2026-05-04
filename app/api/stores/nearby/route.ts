import { NextRequest, NextResponse } from "next/server";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const RADIUS_M = 3000; // Reduced to 3km for better results

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { detail: "Query params lat and lng are required numbers." },
      { status: 400 }
    );
  }

  // Expanded query to include more store types and brands
  const query = `[out:json][timeout:25];
    (
      node(around:${RADIUS_M},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food|department_store|hypermarket)$"];
      way(around:${RADIUS_M},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food|department_store|hypermarket)$"];
      node(around:${RADIUS_M},${lat},${lng})["amenity"="marketplace"];
      node(around:${RADIUS_M},${lat},${lng})["name"~"walmart|target|kroger|safeway|whole foods|trader joe|costco|sam's club|aldi|publix|wegmans|giant|stop & shop|food lion|harris teeter|meijer|heb|king soopers|fred meyer|ralphs|vons|albertsons|winn-dixie|bi-lo|piggly wiggly",i];
      way(around:${RADIUS_M},${lat},${lng})["name"~"walmart|target|kroger|safeway|whole foods|trader joe|costco|sam's club|aldi|publix|wegmans|giant|stop & shop|food lion|harris teeter|meijer|heb|king soopers|fred meyer|ralphs|vons|albertsons|winn-dixie|bi-lo|piggly wiggly",i];
    );
    out center body;`;
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
