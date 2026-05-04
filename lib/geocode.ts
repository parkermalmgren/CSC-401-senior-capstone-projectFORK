/**
 * Geocode a place name or address using OpenStreetMap Nominatim (no API key).
 * Use sparingly; Nominatim asks for max 1 request per second.
 */
export async function geocodeSearch(
  query: string
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `/api/geocode?q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  const first = data?.[0];
  if (!first) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return {
    lat,
    lng,
    displayName: first.display_name ?? query,
  };
}
