// components/EditItemModal.tsx
// Modal component for editing existing pantry items

"use client";

import { useState, FormEvent, useEffect, useCallback, useRef } from "react";
import { BackendItem, suggestExpirationDate, getAuthToken } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (itemId: string, item: { 
    name?: string; 
    quantity?: number; 
    expiration_date?: string | null;
    storage_type?: string;
    is_opened?: boolean;
  }) => Promise<void>;
  item: BackendItem | null;
  isPending?: boolean;
}

export default function EditItemModal({ isOpen, onClose, onUpdate, item, isPending = false }: EditItemModalProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expirationDate, setExpirationDate] = useState("");
  const [storageType, setStorageType] = useState<"pantry" | "fridge" | "freezer">("pantry");
  const [storageTypeManuallySet, setStorageTypeManuallySet] = useState(false);
  const [isOpened, setIsOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedFood, setSelectedFood] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [suggestingExpiration, setSuggestingExpiration] = useState(false);
  const [suggestedExpiration, setSuggestedExpiration] = useState<string | null>(null);
  const [expirationConfidence, setExpirationConfidence] = useState<"high" | "medium" | "low" | null>(null);
  const [recommendedStorage, setRecommendedStorage] = useState<string | null>(null);

  const skipNextStorageRefetch = useRef(false);

  /**
   * Core suggestion function - stable callback with no dependencies
   */
  const fetchSuggestions = useCallback(async (
    itemName: string,
    storage: string,
    opened: boolean,
    usdaFood: any,
    autoFillStorage: boolean
  ) => {
    if (!itemName.trim()) return;
    setSuggestingExpiration(true);
    try {
      const suggestion = await suggestExpirationDate({
        name: itemName.trim(),
        storage_type: storage,
        is_opened: opened,
        usda_fdc_id: usdaFood?.fdcId ?? null,
        usda_food_category: usdaFood?.foodCategory?.description ?? null,
      });

      setRecommendedStorage(suggestion.recommended_storage_type ?? null);

      // Auto-fill the storage type when allowed
      if (autoFillStorage && suggestion.recommended_storage_type) {
        const newStorage = suggestion.recommended_storage_type as "pantry" | "fridge" | "freezer";
        if (newStorage !== storage) {
          skipNextStorageRefetch.current = true;
          setStorageType(newStorage);
          setStorageTypeManuallySet(false);

          // Re-fetch expiration immediately using the correct (recommended) storage type
          const correctedSuggestion = await suggestExpirationDate({
            name: itemName.trim(),
            storage_type: newStorage,
            is_opened: opened,
            usda_fdc_id: usdaFood?.fdcId ?? null,
            usda_food_category: usdaFood?.foodCategory?.description ?? null,
          });
          if (correctedSuggestion.suggested_date) {
            setSuggestedExpiration(correctedSuggestion.suggested_date);
            setExpirationConfidence(correctedSuggestion.confidence);
            setExpirationDate(correctedSuggestion.suggested_date);
          } else {
            setSuggestedExpiration(null);
            setExpirationConfidence(null);
            setExpirationDate("");
          }
          return;
        }
      }

      // Set expiration from this call
      if (suggestion.suggested_date) {
        setSuggestedExpiration(suggestion.suggested_date);
        setExpirationConfidence(suggestion.confidence);
        setExpirationDate(suggestion.suggested_date);
      } else {
        setSuggestedExpiration(null);
        setExpirationConfidence(null);
        setExpirationDate("");
      }
    } catch (err) {
      console.error("Error fetching suggestions:", err);
    } finally {
      setSuggestingExpiration(false);
    }
  }, []);

  // Initialize form when item changes
  useEffect(() => {
    if (item) {
      setName(item.name || "");
      setQuantity(item.quantity?.toString() || "1");
      setExpirationDate(item.expiration_date ? item.expiration_date.split("T")[0] : "");
      setStorageType((item.storage_type as "pantry" | "fridge" | "freezer") || "pantry");
      setIsOpened(item.is_opened || false);
      setStorageTypeManuallySet(true); // Don't auto-fill on edit
      setSelectedFood(null);
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      setSuggestedExpiration(null);
      setExpirationConfidence(null);
      setRecommendedStorage(null);
    }
  }, [item]);

  // USDA food search (debounced)
  useEffect(() => {
    if (!isOpen || selectedFood) {
      setShowResults(false);
      return;
    }
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          setSearchResults([]);
          setShowResults(false);
          return;
        }
        const response = await fetch(
          `${API_BASE_URL}/api/food/search?query=${encodeURIComponent(searchQuery)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        setSearchResults(Array.isArray(data) ? data : []);
        setShowResults(true);
      } catch (err) {
        console.error("Error searching food:", err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, selectedFood]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showResults) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".search-dropdown-container")) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showResults]);

  // Re-fetch when food name changes (debounced 500ms)
  useEffect(() => {
    if (!isOpen) return;
    if (name.trim().length >= 3) {
      const timer = setTimeout(() => {
        fetchSuggestions(name, storageType, isOpened, selectedFood, !storageTypeManuallySet);
      }, 500);
      return () => clearTimeout(timer);
    } else if (!name.trim()) {
      setSuggestedExpiration(null);
      setExpirationConfidence(null);
      setRecommendedStorage(null);
      setExpirationDate("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, isOpen]);

  // Re-fetch expiration when storage type or opened status changes
  useEffect(() => {
    if (!isOpen || name.trim().length < 3) return;

    if (skipNextStorageRefetch.current) {
      skipNextStorageRefetch.current = false;
      return;
    }

    const timer = setTimeout(() => {
      fetchSuggestions(name, storageType, isOpened, selectedFood, false);
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageType, isOpened, isOpen]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!name.trim()) {
      setError("Item name is required");
      setSubmitting(false);
      return;
    }

    const quantityNum = parseInt(quantity, 10);
    if (isNaN(quantityNum) || quantityNum < 1) {
      setError("Quantity must be at least 1");
      setSubmitting(false);
      return;
    }

    if (expirationDate) {
      const selectedDate = new Date(expirationDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);
      
      if (selectedDate < today) {
        setError("Expiration date cannot be in the past");
        setSubmitting(false);
        return;
      }
    }

    try {
      await onUpdate(item.id, {
        name: name.trim(),
        quantity: quantityNum,
        expiration_date: expirationDate || null,
        storage_type: storageType,
        is_opened: isOpened,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting && !isPending) {
      onClose();
    }
  };

  const handleSelectFood = (food: any) => {
    const foodName = food.description || food.name || "";
    setSelectedFood(food);
    setName(foodName);
    setSearchQuery("");
    setShowResults(false);
    setStorageTypeManuallySet(false);
    if (foodName.trim()) {
      fetchSuggestions(foodName, storageType, isOpened, food, true);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  const getStorageDisplayName = (type: string) => {
    if (type === "fridge") return "Refrigerator";
    if (type === "freezer") return "Freezer";
    return "Pantry";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Edit Item</h2>
          <button
            onClick={handleClose}
            disabled={submitting || isPending}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── STEP 1: Food Item ────────────────────────────────────────── */}
          <div>
            <label htmlFor="edit-food-item" className="block text-sm font-semibold text-gray-800 mb-2">
              1. Food Item <span className="text-red-500">*</span>
            </label>
            <div className="relative search-dropdown-container">
              <input
                id="edit-food-item"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSearchQuery(e.target.value);
                  setSelectedFood(null);
                }}
                placeholder="Enter item name or search USDA database"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors text-base"
                disabled={submitting || isPending}
                required
                maxLength={200}
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-5 w-5 border-2 border-green-500 border-t-transparent rounded-full"></div>
                </div>
              )}
              {showResults && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((food, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectFood(food)}
                      className="w-full text-left px-4 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium text-gray-800">{food.description || food.name}</div>
                      {food.brandOwner && (
                        <div className="text-xs text-gray-500">{food.brandOwner}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedFood && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-green-800">{selectedFood.description}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── STEP 2: Storage Location ─────────────────────────────────── */}
          <div>
            <label htmlFor="edit-storage-type" className="block text-sm font-semibold text-gray-800 mb-2">
              2. Storage Location <span className="text-red-500">*</span>
              {recommendedStorage && recommendedStorage === storageType && name.trim().length >= 3 && (
                <span className="ml-2 text-xs font-normal text-green-600">(Recommended)</span>
              )}
            </label>
            <div className="relative">
              <select
                id="edit-storage-type"
                value={storageType}
                onChange={(e) => {
                  const newStorage = e.target.value as "pantry" | "fridge" | "freezer";
                  setStorageType(newStorage);
                  setStorageTypeManuallySet(true);
                  if (name.trim().length >= 3) {
                    fetchSuggestions(name, newStorage, isOpened, selectedFood, false);
                  }
                }}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors text-base appearance-none bg-white"
                disabled={submitting || isPending || !name.trim()}
              >
                <option value="pantry">Pantry / Room Temperature</option>
                <option value="fridge">Refrigerator</option>
                <option value="freezer">Freezer</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {recommendedStorage && name.trim().length >= 3 && (
              <div className="mt-2">
                {recommendedStorage === storageType ? (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-xs font-medium text-green-800">
                      ✓ Using recommended: {getStorageDisplayName(recommendedStorage)}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs font-medium text-amber-800">
                        💡 Recommended: {getStorageDisplayName(recommendedStorage)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const rec = recommendedStorage as "pantry" | "fridge" | "freezer";
                        setStorageType(rec);
                        setStorageTypeManuallySet(false);
                        fetchSuggestions(name, rec, isOpened, selectedFood, false);
                      }}
                      className="text-xs text-amber-700 underline hover:text-amber-900 font-medium ml-2"
                    >
                      Use recommended →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── STEP 3: Expiration Date ───────────────────────────────────── */}
          <div>
            <label htmlFor="edit-expiration-date" className="block text-sm font-semibold text-gray-800 mb-2">
              3. Expiration Date <span className="text-gray-500 text-xs font-normal">(optional)</span>
              {suggestingExpiration && (
                <span className="ml-2 text-xs text-blue-600 font-normal">⏳ Calculating...</span>
              )}
            </label>
            <input
              id="edit-expiration-date"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              min={today}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors text-base"
              disabled={submitting || isPending}
            />

            {suggestedExpiration && name.trim().length >= 3 && (
              <div className="mt-2">
                {expirationDate === suggestedExpiration ? (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-xs font-medium text-green-800">
                      ✓ Using suggested date ({expirationConfidence && `Confidence: ${expirationConfidence}`})
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs font-medium text-blue-800">
                        💡 Suggested: {new Date(suggestedExpiration).toLocaleDateString()} ({expirationConfidence && `Confidence: ${expirationConfidence}`})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpirationDate(suggestedExpiration)}
                      className="text-xs text-blue-700 underline hover:text-blue-900 font-medium ml-2"
                    >
                      Use suggested →
                    </button>
                  </div>
                )}
              </div>
            )}

            {!suggestedExpiration && name.trim().length >= 3 && !suggestingExpiration && (
              <p className="text-xs text-gray-500 mt-2">
                No expiration suggestion available. Leave empty for non-perishable items.
              </p>
            )}
          </div>

          {/* ── Additional Options ────────────────────────────────────────── */}
          <div className="border-t border-gray-200 pt-4">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-2">
                <svg className="h-4 w-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Additional Options
              </summary>
              <div className="mt-4 space-y-4 pl-6">
                <div>
                  <label htmlFor="edit-quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    id="edit-quantity"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
                    disabled={submitting || isPending}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isOpened}
                      onChange={(e) => {
                        const opened = e.target.checked;
                        setIsOpened(opened);
                        if (name.trim().length >= 3) {
                          fetchSuggestions(name, storageType, opened, selectedFood, false);
                        }
                      }}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      disabled={submitting || isPending}
                    />
                    <span className="text-sm font-medium text-gray-700">Item has been opened</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">Opened items typically have shorter shelf life</p>
                </div>
              </div>
            </details>
          </div>

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* ── Buttons ───────────────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting || isPending}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || isPending || !name.trim()}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting || isPending ? "Updating..." : "Update Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
