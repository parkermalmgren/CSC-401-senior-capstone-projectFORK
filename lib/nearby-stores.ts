/** Single grocery/store from Overpass (OSM) */
export interface NearbyStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const RADIUS_M = 5000;

type OsmNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: { name?: string };
};
type OsmWay = {
  type: "way";
  id: number;
  center?: { lat: number; lon: number };
  tags?: { name?: string };
};

/**
 * Fetch grocery/supermarket/convenience/general stores and marketplaces near a point.
 * Queries both nodes and ways (buildings), and uses a 5 km radius to catch more stores.
 */
export async function fetchNearbyStores(
  lat: number,
  lng: number
): Promise<NearbyStore[]> {
  const r = RADIUS_M;
  const query = `[out:json][timeout:20];(node(around:${r},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food)$"];way(around:${r},${lat},${lng})["shop"~"^(supermarket|grocery|convenience|general|food)$"];node(around:${r},${lat},${lng})["amenity"="marketplace"];);out center body;`;
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch nearby stores");
  const data = (await res.json()) as { elements?: Array<OsmNode | OsmWay> };
  const elements = data.elements ?? [];
  const seen = new Set<string>();
  const results: NearbyStore[] = [];

  for (const el of elements) {
    let pointLat: number;
    let pointLng: number;
    if (el.type === "node" && "lat" in el && "lon" in el) {
      pointLat = el.lat;
      pointLng = el.lon;
    } else if (el.type === "way" && el.center) {
      pointLat = el.center.lat;
      pointLng = el.center.lon;
    } else {
      continue;
    }
    const key = `${pointLat.toFixed(5)},${pointLng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = el.tags?.name?.trim() || "Store";
    results.push({
      id: `${el.type}-${el.id}`,
      name,
      lat: pointLat,
      lng: pointLng,
    });
  }

  return results;
}