import { NextRequest, NextResponse } from "next/server";

// Multiple Overpass API servers for redundancy
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter"
];

const RADIUS_M = 3000; // 3km radius

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));

  console.log('Store search request:', { lat, lng });

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { detail: "Query params lat and lng are required numbers." },
      { status: 400 }
    );
  }

  // Simplified query that should be more reliable
  const query = `[out:json][timeout:20];
    (
      node(around:${RADIUS_M},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food|department_store)$"];
      way(around:${RADIUS_M},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food|department_store)$"];
      node(around:${RADIUS_M},${lat},${lng})["amenity"="marketplace"];
    );
    out center body;`;

  console.log('Overpass query:', query);

  // Try multiple servers
  for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
    const serverUrl = OVERPASS_SERVERS[i];
    const url = `${serverUrl}?data=${encodeURIComponent(query)}`;
    
    console.log(`Trying server ${i + 1}/${OVERPASS_SERVERS.length}:`, serverUrl);

    try {
      const upstream = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { 
          Accept: "application/json",
          "User-Agent": "SmartPantry/1.0"
        },
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      console.log(`Server ${i + 1} response status:`, upstream.status);
      const text = await upstream.text();
      console.log(`Server ${i + 1} response length:`, text.length);

      if (!upstream.ok) {
        console.error(`Server ${i + 1} error:`, upstream.status, text.slice(0, 200));
        continue; // Try next server
      }

      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
        const elementCount = (data as any)?.elements?.length || 0;
        console.log(`Server ${i + 1} parsed elements:`, elementCount);
        
        // Success! Return the data
        return NextResponse.json(data, { status: 200 });
      } catch (parseError) {
        console.error(`Server ${i + 1} JSON parse error:`, parseError);
        continue; // Try next server
      }
    } catch (networkError) {
      console.error(`Server ${i + 1} network error:`, networkError);
      continue; // Try next server
    }
  }

  // All servers failed
  return NextResponse.json(
    { detail: "Could not load nearby stores. All Overpass servers are unavailable." },
    { status: 502 }
  );
}
