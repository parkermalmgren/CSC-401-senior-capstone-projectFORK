"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { fetchNearbyStores, type NearbyStore } from "@/lib/nearby-stores";
import { geocodeSearch } from "@/lib/geocode";

const StoreMap = dynamic(() => import("@/components/StoreMap"), { ssr: false });

const CHECKED_STORES_KEY = "smart-pantry-checked-stores";

function loadCheckedStoreIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(CHECKED_STORES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveCheckedStoreIds(ids: Set<string>): boolean {
  if (typeof window === "undefined") return true;
  try {
    localStorage.setItem(CHECKED_STORES_KEY, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}

export default function ShoppingPageContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  /** Map center and origin for store search (user location or geocoded search) */
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [checkedStoreIds, setCheckedStoreIds] = useState<Set<string>>(new Set());
  const [checkedStoresPersistError, setCheckedStoresPersistError] = useState<string | null>(null);

  const DEFAULT_MAP_CENTER = { lat: 40.7488, lng: -73.9857 };

  const loadChecked = useCallback(() => setCheckedStoreIds(loadCheckedStoreIds()), []);
  useEffect(() => {
    loadChecked();
  }, [loadChecked]);

  useEffect(() => {
    if (!mapCenter) {
      setNearbyStores([]);
      setStoresError(null);
      return;
    }
    let cancelled = false;
    setStoresLoading(true);
    setStoresError(null);
    fetchNearbyStores(mapCenter.lat, mapCenter.lng)
      .then((list) => {
        if (!cancelled) {
          setNearbyStores(list);
          setStoresError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setStoresError("Could not load nearby stores.");
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapCenter]);

  const toggleStoreChecked = (storeId: string) => {
    setCheckedStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      if (saveCheckedStoreIds(next)) {
        setCheckedStoresPersistError(null);
      } else {
        setCheckedStoresPersistError(
          "Could not save visited stores. Storage may be full or blocked (e.g. private browsing)."
        );
      }
      return next;
    });
  };

  const useMyLocation = () => {
    setLocationError(null);
    setSearchError(null);
    setLocationLoading(true);
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = { lat: latitude, lng: longitude };
        setUserLocation(coords);
        setMapCenter(coords);
        setLocationLoading(false);
      },
      () => {
        setLocationError("Could not get your location. Check permissions or try Search Stores.");
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const searchStores = async () => {
    const query = searchQuery.trim() || "grocery stores";
    setSearchError(null);
    setSearchLoading(true);
    try {
      const result = await geocodeSearch(query);
      if (result) {
        setMapCenter({ lat: result.lat, lng: result.lng });
        setSearchQuery(result.displayName.split(",").slice(0, 2).join(",").trim());
      } else {
        setSearchError("No results for that search. Try a city name or address.");
      }
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-4xl font-bold text-slate-800 mb-1">Nearby Shops</h1>
        <p className="text-slate-600">Use your location or search to find grocery stores nearby.</p>
      </header>

      <section className="mb-6">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <h2 className="text-xl font-semibold text-slate-800 mb-3">Find Nearby Stores</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={locationLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {locationLoading ? "Getting location…" : "Use My Location"}
              </button>
              <div className="flex gap-2 flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchStores()}
                  placeholder="City or address"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => searchStores()}
                  disabled={searchLoading}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  {searchLoading ? "Searching…" : "Search Stores"}
                </button>
              </div>
            </div>
            {locationError && (
              <p className="mt-2 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                {locationError}
              </p>
            )}
            {searchError && (
              <p className="mt-2 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                {searchError}
              </p>
            )}
          </div>
          <div className="grid lg:grid-cols-[1fr,300px] gap-0">
            <div className="relative min-h-[360px] bg-slate-100">
              <StoreMap
                center={mapCenter ?? DEFAULT_MAP_CENTER}
                userLocation={userLocation}
                stores={nearbyStores}
                className="w-full h-full min-h-[360px] rounded-none"
              />
              <div className="absolute bottom-2 left-2 flex gap-2 text-xs text-slate-600 bg-white/90 backdrop-blur px-2 py-1.5 rounded-lg shadow">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#16a34a] border border-white shadow" /> Store
                </span>
                <span className="flex items-center gap-1.5">
                  <img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" alt="" className="w-3 h-5 object-contain" /> You
                </span>
              </div>
            </div>
            <div className="border-l border-slate-100 flex flex-col max-h-[400px]">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                <h3 className="font-semibold text-slate-800">Stores in your area</h3>
                {checkedStoresPersistError && (
                  <p className="mt-2 text-xs text-amber-800 bg-amber-50 px-2 py-1.5 rounded-lg">
                    {checkedStoresPersistError}
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {!mapCenter && (
                  <p className="text-sm text-slate-500 py-4 text-center">
                    Use &quot;Use My Location&quot; or search for a city/address to find stores on the map.
                  </p>
                )}
                {mapCenter && storesLoading && (
                  <p className="text-sm text-slate-500 py-4 text-center">Loading stores…</p>
                )}
                {mapCenter && storesError && (
                  <p className="text-sm text-amber-700 py-2">{storesError}</p>
                )}
                {mapCenter && !storesLoading && !storesError && nearbyStores.length === 0 && (
                  <p className="text-sm text-slate-500 py-4 text-center">
                    No grocery stores found within 5 km. Try another area.
                  </p>
                )}
                {mapCenter && !storesLoading && nearbyStores.length > 0 && (
                  <ul className="space-y-1">
                    {nearbyStores.map((store) => {
                      const checked = checkedStoreIds.has(store.id);
                      return (
                        <li
                          key={store.id}
                          className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 group"
                        >
                          <button
                            type="button"
                            onClick={() => toggleStoreChecked(store.id)}
                            className="flex-shrink-0 w-5 h-5 rounded border-2 border-slate-300 flex items-center justify-center hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                            aria-label={checked ? "Mark unvisited" : "Mark visited"}
                          >
                            {checked && <span className="text-green-600 font-bold text-sm">✓</span>}
                          </button>
                          <span
                            className={`flex-1 text-sm text-slate-800 truncate ${
                              checked ? "line-through text-slate-500" : ""
                            }`}
                            title={store.name}
                          >
                            {store.name}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
