// components/DashboardHome.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { useMemo, useState, useEffect } from "react";
import { type PantryItem } from "@/data/pantry-items";
import { getItems, getItem, backendItemToFrontend, updateItem, deleteItem, getWasteSaved, getAuthToken, type BackendItem } from "@/lib/api";
import { useOptimisticItems } from "@/lib/hooks/useOptimisticItems";
import AddItemModal from "./AddItemModal";
import EditItemModal from "./EditItemModal";
import ReceiptScannerModal from "./ReceiptScannerModal";
import NutritionFactsModal from "./NutritionFactsModal";

type Item = PantryItem;

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-white shadow-soft border">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

export default function DashboardHome() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"added" | "expires">("added");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [selectedItemForNutrition, setSelectedItemForNutrition] = useState<{ name: string; id: string; quantity: number } | null>(null);
  const [editingItem, setEditingItem] = useState<BackendItem | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [households, setHouseholds] = useState<Array<{id: string, name: string}>>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>(null);
  const [wasteSaved, setWasteSaved] = useState<{items_saved: number; this_month: number; all_time: number} | null>(null);

  // Fetch households
  const fetchHouseholds = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/households`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHouseholds(data.households || []);
        if (data.households && data.households.length > 0) {
          setSelectedHousehold(data.households[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load households:', err);
    }
  };

  // Fetch items from API
  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      // Get all items with backend filtering/sorting
      const response = await getItems({
        sort_by: sort === "expires" ? "expiration_date" : "created_at",
        sort_order: "desc",
        household_id: selectedHousehold || undefined,
      });
      
      // Ensure response has items array
      if (response && response.items && Array.isArray(response.items)) {
        const frontendItems = response.items.map(backendItemToFrontend);
        setItems(frontendItems);
      } else {
        console.error("Unexpected response format:", response);
        setError("Unexpected response format from API");
        setItems([]); // Set empty array as fallback
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
      console.error("Error fetching items:", err);
      setItems([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHouseholds();
  }, []);

  useEffect(() => {
    if (selectedHousehold) {
      fetchItems();
    }
  }, [sort, selectedHousehold]);

  // Fetch waste saved statistics
  const fetchWasteSaved = async () => {
    try {
      const stats = await getWasteSaved();
      setWasteSaved({
        items_saved: stats.items_saved,
        this_month: stats.this_month,
        all_time: stats.all_time
      });
    } catch (err) {
      console.error("Error fetching waste saved:", err);
      // Don't show error to user, just log it
    }
  };

  useEffect(() => {
    fetchWasteSaved();
  }, []);

  // Listen for refresh events (from optimistic updates)
  useEffect(() => {
    const handleRefresh = () => {
      fetchItems();
    };
    window.addEventListener("items-refresh", handleRefresh);
    return () => window.removeEventListener("items-refresh", handleRefresh);
  }, [sort]);

  // Set up optimistic update hooks
  const {
    optimisticCreate,
    optimisticUpdate,
    optimisticDelete,
    isPending,
    pendingId,
  } = useOptimisticItems(items, setItems, fetchItems);

  // Handle nutrition facts view
  const handleViewNutrition = (item: Item) => {
    setSelectedItemForNutrition({ name: item.name, id: item.id, quantity: item.quantity });
    setShowNutritionModal(true);
  };
  const handleEditItem = async (item: Item) => {
    try {
      // Fetch full item data from API
      const fullItem = await getItem(item.id);
      setEditingItem(fullItem);
      setShowEditModal(true);
    } catch (err) {
      console.error("Error fetching item details:", err);
      alert(err instanceof Error ? err.message : "Failed to load item details");
    }
  };

  // Handle update item
  const handleUpdateItem = async (itemId: string, itemData: { 
    name?: string; 
    quantity?: number; 
    expiration_date?: string | null;
    storage_type?: string;
    is_opened?: boolean;
  }) => {
    try {
      await optimisticUpdate(itemId, itemData);
      setShowEditModal(false);
      setEditingItem(null);
    } catch (err) {
      throw err; // Error is handled in EditItemModal
    }
  };

  // Handle delete item
  const handleDeleteClick = (itemId: string) => {
    setDeletingItemId(itemId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItemId) return;
    
    try {
      await optimisticDelete(deletingItemId);
      setShowDeleteConfirm(false);
      setDeletingItemId(null);
      // Refresh waste saved stats after deletion
      fetchWasteSaved();
    } catch (err) {
      console.error("Error deleting item:", err);
      alert(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeletingItemId(null);
  };

  // Expose optimistic functions (can be used by child components or buttons)
  // For now, these are available but not used in this component
  // Components that need to create/update/delete can use these
  useEffect(() => {
    // Store optimistic functions in a way that child components can access them
    // This is a simple pattern - in a more complex app, you might use Context API
    (window as any).__optimisticItemsAPI = {
      create: optimisticCreate,
      update: optimisticUpdate,
      delete: optimisticDelete,
      isPending,
      pendingId,
    };
  }, [optimisticCreate, optimisticUpdate, optimisticDelete, isPending, pendingId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter(i => !q || i.name.toLowerCase().includes(q));
    if (sort === "added") return list.sort((a,b) => (a.addedAt > b.addedAt ? -1 : 1));
    return list.sort((a,b) => ((a.expiresInDays ?? 999) - (b.expiresInDays ?? 999)));
  }, [query, sort, items]);

  const expiringSoon = items
    .filter(i => i.status === "expiring")
    .sort((a,b) => (a.expiresInDays ?? 999) - (b.expiresInDays ?? 999))
    .slice(0, 5);

  const recentlyAdded = items
    .slice()
    .sort((a,b) => (a.addedAt > b.addedAt ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 grid gap-4 sm:gap-8">
      <header className="text-center grid gap-2 sm:gap-3">
        <div className="mx-auto">
          <Image src="/Green_Basket_Icon.png" width={48} height={48} alt="SmartPantry" className="w-12 h-12 sm:w-14 sm:h-14" />
        </div>
        <h1 className="text-xl sm:text-3xl font-semibold">SmartPantry</h1>
        <p className="text-xs sm:text-base text-slate-600 px-2">Welcome back! Here&apos;s a quick look at your pantry.</p>
        
        {/* Household Selector */}
        {households.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <label className="text-sm font-medium text-slate-700">Viewing:</label>
            <select
              value={selectedHousehold || ""}
              onChange={(e) => setSelectedHousehold(e.target.value)}
              className="border border-slate-300 rounded-lg px-4 py-2 text-sm bg-white font-medium text-slate-800 hover:border-green-500 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
              disabled={loading}
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      <section className="grid gap-3 sm:gap-4 md:grid-cols-3">
        <div className="card p-4 sm:p-6">
          <h3 className="font-semibold mb-2 text-sm sm:text-base">Expiring Soon</h3>
          <ul className="text-slate-700 text-xs sm:text-sm space-y-1">
            {expiringSoon.map(i => (
              <li key={i.id} className="flex items-center justify-between">
                <span className="truncate pr-2">{i.name}</span>
                <span className="text-slate-400 flex-shrink-0">{i.expiresInDays! >= 0 ? `${i.expiresInDays}d` : "expired"}</span>
              </li>
            ))}
            {expiringSoon.length === 0 && <li className="text-slate-400">Nothing expiring soon 🎉</li>}
          </ul>
        </div>

        <div className="card p-4 sm:p-6">
          <h3 className="font-semibold mb-2 text-sm sm:text-base">Recently Added</h3>
          <ul className="text-slate-700 text-xs sm:text-sm space-y-1">
            {recentlyAdded.map(i => (
              <li key={i.id} className="flex items-center justify-between">
                <span className="truncate pr-2">{i.name}</span>
                <span className="text-slate-400 flex-shrink-0 text-xs">{new Date(i.addedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-4 sm:p-6">
          <h3 className="font-semibold mb-2 text-sm sm:text-base">Waste Saved</h3>
          {wasteSaved ? (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-green-600">{wasteSaved.all_time}</p>
              <p className="text-slate-600 text-xs sm:text-sm">items used before expiration</p>
              <p className="text-slate-500 text-xs mt-2">{wasteSaved.this_month} this month</p>
            </div>
          ) : (
            <p className="text-slate-600 text-xs sm:text-sm">Loading...</p>
          )}
        </div>
      </section>

      <section className="card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-2">
            <div className="flex items-center gap-2 flex-1">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search"
                className="border rounded-full px-3 py-1.5 text-base sm:text-sm flex-1 min-w-0"
                disabled={loading}
              />
              <div className="hidden md:flex items-center gap-2">
                <Pill color="#22c55e">Fresh</Pill>
                <Pill color="#fbbf24">Expiring Soon</Pill>
                <Pill color="#ef4444">Expired</Pill>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="text-xs sm:text-sm text-slate-600">Sort</label>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as "added" | "expires")}
                className="border rounded-lg px-2 py-1 text-base sm:text-sm bg-white"
                disabled={loading}
              >
                <option value="added">Recently Added</option>
                <option value="expires">Expires (Soonest First)</option>
              </select>
            </div>
          </div>

          {loading && (
            <div className="text-center py-8 text-slate-500">
              <p>Loading pantry items...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-600 mb-2">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-blue-600 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="divide-y max-h-[40vh] sm:max-h-none overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <p>No items found. {query ? "Try a different search." : "Add your first item to get started!"}</p>
                  </div>
                ) : (
                  filtered.map(i => (
                    <div key={i.id} className="py-2 sm:py-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <span
                          className="inline-block w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              i.status === "fresh" ? "#22c55e" :
                              i.status === "expiring" ? "#fbbf24" : "#ef4444",
                          }}
                        />
                        <button
                          onClick={() => handleViewNutrition(i)}
                          className="font-medium text-sm sm:text-base truncate text-left hover:text-green-600 hover:underline transition-colors"
                          title="View nutrition facts"
                        >
                          {i.name}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-500">
                          {i.status === "expired"
                            ? "expired"
                            : typeof i.expiresInDays === "number"
                              ? `${i.expiresInDays}d`
                              : ""}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditItem(i)}
                            disabled={isPending}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Edit item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteClick(i.id)}
                            disabled={isPending}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0">
            <Link href={"/pantry" as Route} className="text-xs sm:text-sm text-slate-600 hover:underline text-center sm:text-left">
              View full pantry →
            </Link>
            <div className="flex gap-2">
              <button
                onClick={() => setShowScanModal(true)}
                className="px-4 py-2 rounded-full bg-blue-600 text-white text-xs sm:text-sm text-center hover:bg-blue-700 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || isPending}
              >

                Scan Receipt
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 rounded-full bg-green-600 text-white text-xs sm:text-sm text-center hover:bg-green-700 transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || isPending}
              >
                Add Item to Pantry
              </button>
            </div>
          </div>

          {/* Add Item Modal */}
          <AddItemModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onCreate={async (itemData) => {
              try {
                await optimisticCreate({
                  name: itemData.name,
                  quantity: itemData.quantity,
                  expiration_date: itemData.expiration_date,
                  storage_type: itemData.storage_type,
                  is_opened: itemData.is_opened,
                });
                // Modal will close on success (handled in AddItemModal)
              } catch (err) {
                // Error is handled in AddItemModal
                throw err;
              }
            }}
            isPending={isPending}
          />

          {/* Receipt Scanner Modal */}
          <ReceiptScannerModal
            isOpen={showScanModal}
            onClose={() => setShowScanModal(false)}
            onItemsAdded={() => {
              // Refresh items list after scanning
              fetchItems();
            }}
          />

          {/* Edit Item Modal */}
          <EditItemModal
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setEditingItem(null);
            }}
            onUpdate={handleUpdateItem}
            item={editingItem}
            isPending={isPending}
          />

          {/* Delete Confirmation Dialog */}
          {showDeleteConfirm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
              onClick={handleCancelDelete}
            >
              <div
                className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Delete Item</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete this item? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelDelete}
                    disabled={isPending}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={isPending}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Nutrition Facts Modal */}
          {selectedItemForNutrition && (
            <NutritionFactsModal
              isOpen={showNutritionModal}
              onClose={() => {
                setShowNutritionModal(false);
                setSelectedItemForNutrition(null);
              }}
              itemName={selectedItemForNutrition.name}
              itemId={selectedItemForNutrition.id}
              quantity={selectedItemForNutrition.quantity}
            />
          )}
        </div>
      </section>
    </div>
  );
}