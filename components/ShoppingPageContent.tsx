"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { fetchNearbyStores, type NearbyStore } from "@/lib/nearby-stores";
import { geocodeSearch } from "@/lib/geocode";
import {
  getShoppingList,
  createShoppingListItem,
  updateShoppingListItem,
  deleteShoppingListItem,
  clearCheckedShoppingListItems,
  getAuthToken,
  type ShoppingListItem,
} from "@/lib/api";

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

  const [households, setHouseholds] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>(null);
  const [shopItems, setShopItems] = useState<ShoppingListItem[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("");
  const [shopActionBusy, setShopActionBusy] = useState(false);

  const DEFAULT_MAP_CENTER = { lat: 40.7488, lng: -73.9857 };

  const loadChecked = useCallback(() => setCheckedStoreIds(loadCheckedStoreIds()), []);
  useEffect(() => {
    loadChecked();
  }, [loadChecked]);

  const fetchHouseholds = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(`${base}/api/households`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const list = data.households || [];
        setHouseholds(list);
        if (list.length > 0) {
          setSelectedHousehold((prev) => prev ?? list[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchHouseholds();
  }, [fetchHouseholds]);

  const loadShoppingList = useCallback(async () => {
    if (!selectedHousehold) {
      setShopItems([]);
      return;
    }
    setShopLoading(true);
    setShopError(null);
    try {
      const items = await getShoppingList(selectedHousehold);
      setShopItems(items);
    } catch (e) {
      setShopError(e instanceof Error ? e.message : "Failed to load shopping list");
      setShopItems([]);
    } finally {
      setShopLoading(false);
    }
  }, [selectedHousehold]);

  useEffect(() => {
    loadShoppingList();
  }, [loadShoppingList]);

  const handleAddShoppingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemName.trim();
    if (!name || !selectedHousehold || shopActionBusy) return;
    setShopActionBusy(true);
    setShopError(null);
    try {
      const created = await createShoppingListItem(
        { name, quantity: newItemQty.trim() || null },
        selectedHousehold
      );
      setShopItems((prev) => [created, ...prev]);
      setNewItemName("");
      setNewItemQty("");
    } catch (err) {
      setShopError(err instanceof Error ? err.message : "Could not add item");
    } finally {
      setShopActionBusy(false);
    }
  };

  const handleToggleShopItem = async (item: ShoppingListItem) => {
    if (!selectedHousehold) return;
    const next = !item.checked;
    setShopItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, checked: next } : x)));
    try {
      const updated = await updateShoppingListItem(item.id, { checked: next }, selectedHousehold);
      setShopItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch {
      setShopItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, checked: item.checked } : x)));
      setShopError("Could not update item. Try again.");
    }
  };

  const handleDeleteShopItem = async (id: string) => {
    if (!selectedHousehold) return;
    const snapshot = shopItems;
    setShopItems((prevList) => prevList.filter((x) => x.id !== id));
    try {
      await deleteShoppingListItem(id, selectedHousehold);
    } catch {
      setShopItems(snapshot);
      setShopError("Could not delete item.");
    }
  };

  const handleClearChecked = async () => {
    if (!selectedHousehold) return;
    setShopActionBusy(true);
    setShopError(null);
    try {
      await clearCheckedShoppingListItems(selectedHousehold);
      setShopItems((prev) => prev.filter((x) => !x.checked));
    } catch (err) {
      setShopError(err instanceof Error ? err.message : "Could not clear checked items");
      loadShoppingList();
    } finally {
      setShopActionBusy(false);
    }
  };

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

     // Debug info
     console.log('=== Geolocation Debug ===');
     console.log('Protocol:', window.location.protocol);
     console.log('Hostname:', window.location.hostname);
     console.log('Full URL:', window.location.href);
     console.log('Secure Context:', window.isSecureContext);
     console.log('Geolocation available:', !!navigator.geolocation);

     // Check if geolocation is supported
     if (!navigator.geolocation) {
       setLocationError("Geolocation is not supported by your browser.");
       setLocationLoading(false);
       return;
     }

     // Check if the connection is secure (HTTPS or localhost)
     if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
       setLocationError("Location access requires a secure connection (HTTPS). Please ensure you're accessing the site via HTTPS, or use localhost for local development. You can also search for your location instead.");
       setLocationLoading(false);
       return;
     }

     console.log('Requesting geolocation...');
     navigator.geolocation.getCurrentPosition(
       (position) => {
         console.log('Geolocation success:', position);
         const { latitude, longitude, accuracy } = position.coords;
         const coords = { lat: latitude, lng: longitude };
         setUserLocation(coords);
         setMapCenter(coords);
         setLocationLoading(false);

         // Show accuracy info to user
         if (accuracy > 1000) {
           setLocationError(`Location found but accuracy is low (±${Math.round(accuracy)}m). Results may not be precise.`);
         }
       },
       (error) => {
         console.log('Geolocation error:', error);
         let errorMsg = "Could not get your location. ";
         switch (error.code) {
           case error.PERMISSION_DENIED:
             errorMsg += "Location permission denied. You should see a browser prompt asking for location access. If not, check: 1) You're on HTTPS or localhost, 2) Browser allows location access, 3) Clear browser cache and try again. You can also search for your location instead.";
             break;
           case error.POSITION_UNAVAILABLE:
             errorMsg += "Location information is unavailable. Try searching for your city instead.";
             break;
           case error.TIMEOUT:
             errorMsg += "Location request timed out. Try again or search for your city.";
             break;
           default:
             errorMsg += "Try searching for your city instead.";
             break;
         }
         setLocationError(errorMsg);
         setLocationLoading(false);
       },
       {
         enableHighAccuracy: true,
         timeout: 15000,
         maximumAge: 300000
       }
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
        <h1 className="text-4xl font-bold text-slate-800 mb-1">Shopping</h1>
        <p className="text-slate-600">Your household list and nearby grocery stores.</p>
      </header>

      <section className="mb-8">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 border border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Your shopping list</h2>
              <p className="text-sm text-slate-600 mt-1">
                Shared with everyone in your household. Check items off as you shop.
              </p>
            </div>
            {households.length > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <label htmlFor="shopping-household" className="text-sm text-slate-600 whitespace-nowrap">
                  Household
                </label>
                <select
                  id="shopping-household"
                  value={selectedHousehold || ""}
                  onChange={(e) => setSelectedHousehold(e.target.value || null)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 focus:ring-2 focus:ring-green-500 outline-none"
                >
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!selectedHousehold && households.length === 0 && (
            <p className="text-sm text-slate-500 py-4">
              Create or join a household to use a shared shopping list.
            </p>
          )}

          {selectedHousehold && (
            <>
              <form onSubmit={handleAddShoppingItem} className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Item name"
                  maxLength={200}
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
                <input
                  type="text"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  placeholder="Qty (optional)"
                  maxLength={200}
                  className="w-full sm:w-36 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={shopActionBusy || !newItemName.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add
                </button>
              </form>

              {shopError && (
                <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded-lg mb-3">{shopError}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-xs text-slate-500">
                  {shopLoading ? "Loading…" : `${shopItems.length} item${shopItems.length !== 1 ? "s" : ""}`}
                </span>
                <button
                  type="button"
                  onClick={handleClearChecked}
                  disabled={shopActionBusy || !shopItems.some((i) => i.checked)}
                  className="text-sm text-slate-700 underline decoration-slate-300 hover:decoration-slate-600 disabled:opacity-40 disabled:no-underline"
                >
                  Clear checked
                </button>
              </div>

              {shopLoading ? (
                <p className="text-sm text-slate-500 py-6 text-center">Loading list…</p>
              ) : shopItems.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                  No items yet. Add something you need to buy.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                  {shopItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50/80"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleShopItem(item)}
                        className="flex-shrink-0 w-5 h-5 rounded border-2 border-slate-300 flex items-center justify-center hover:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                        aria-pressed={item.checked}
                        aria-label={item.checked ? "Mark not purchased" : "Mark purchased"}
                      >
                        {item.checked && <span className="text-green-600 font-bold text-sm">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-sm font-medium text-slate-800 block truncate ${
                            item.checked ? "line-through text-slate-500" : ""
                          }`}
                        >
                          {item.name}
                        </span>
                        {item.quantity ? (
                          <span className="text-xs text-slate-500 truncate block">
                            Qty: {item.quantity}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteShopItem(item.id)}
                        className="text-xs text-red-600 hover:underline flex-shrink-0 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

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
                  <div className="text-sm text-slate-500 py-4 text-center space-y-2">
                    <p>No grocery stores found within 3 km.</p>
                    <p className="text-xs">Try:</p>
                    <ul className="text-xs space-y-1">
                      <li>• Searching for a different area</li>
                      <li>• Looking for "grocery stores near [your city]"</li>
                      <li>• Some rural areas may have limited data</li>
                    </ul>
                  </div>
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
