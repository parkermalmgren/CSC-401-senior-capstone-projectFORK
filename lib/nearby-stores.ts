/** Single grocery/store from Overpass (OSM) */
export interface NearbyStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

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
 * Queries both nodes and ways (buildings), and uses a 3 km radius to catch more stores.
 */
export async function fetchNearbyStores(
  lat: number,
  lng: number
): Promise<NearbyStore[]> {
  const url = `/api/stores/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
  
  try {
    console.log('Fetching stores from:', url);
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Store API error:', res.status, errorText);
      throw new Error(`Failed to fetch nearby stores: ${res.status} ${errorText}`);
    }
    
    const data = (await res.json()) as { elements?: Array<OsmNode | OsmWay> };
    console.log('Store API response:', data);
    
    const elements = data.elements ?? [];
    console.log('Found elements:', elements.length);
    
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

    console.log('Processed stores:', results.length);
    return results;
  } catch (error) {
    console.error('Error in fetchNearbyStores:', error);
    throw error;
  }
}
