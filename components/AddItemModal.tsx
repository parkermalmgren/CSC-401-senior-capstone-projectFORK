// components/AddItemModal.tsx
// Modal component for adding new pantry items

"use client";

import { useState, FormEvent, useEffect, useCallback } from "react";
import { suggestExpirationDate } from "@/lib/api";

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (item: { name: string; quantity: number; expiration_date?: string | null; storage_type?: string; is_opened?: boolean }) => Promise<void>;
  isPending?: boolean;
}

export default function AddItemModal({ isOpen, onClose, onCreate, isPending = false }: AddItemModalProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expirationDate, setExpirationDate] = useState("");
  const [storageType, setStorageType] = useState<"pantry" | "fridge" | "freezer">("pantry");
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

  // Fetch expiration suggestion function
  const fetchExpirationSuggestion = useCallback(async (itemName: string, usdaFood?: any) => {
    if (!itemName.trim()) return;
    
    try {
      setSuggestingExpiration(true);
      const suggestion = await suggestExpirationDate({
        name: itemName.trim(),
        storage_type: storageType,
        is_opened: isOpened,
        usda_fdc_id: usdaFood?.fdcId || null,
        usda_food_category: usdaFood?.foodCategory?.description || null,
      });
      
      if (suggestion.suggested_date) {
        setSuggestedExpiration(suggestion.suggested_date);
        setExpirationConfidence(suggestion.confidence);
        setRecommendedStorage(suggestion.recommended_storage_type);
        
        // Auto-fill expiration date if it's empty or if confidence is high
        setExpirationDate((currentDate) => {
          if (!currentDate || suggestion.confidence === "high") {
            return suggestion.suggested_date;
          }
          return currentDate;
        });
        
        // Auto-set recommended storage type if available and user hasn't manually changed it
        // Only auto-set if storage is still at default (pantry) or if name was just entered
        if (suggestion.recommended_storage_type) {
          // Auto-set if it's the default or if we just got a recommendation
          if (storageType === "pantry" || !name.trim()) {
            setStorageType(suggestion.recommended_storage_type as "pantry" | "fridge" | "freezer");
          }
        }
      }
    } catch (err) {
      console.error("Error fetching expiration suggestion:", err);
      // Silently fail - don't show error to user, just don't suggest
    } finally {
      setSuggestingExpiration(false);
    }
  }, []);

  // Debounced USDA search
  useEffect(() => {
    if (!isOpen) return; // Don't search if modal is closed
    
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/food/search?query=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        setSearchResults(data || []);
        setShowResults(true);
      } catch (err) {
        console.error("Search error:", err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen]);

  // Fetch expiration suggestion when name changes
  useEffect(() => {
    if (!isOpen) return; // Don't suggest if modal is closed
    
    // Only suggest if name is manually entered (not from food search) and has at least 3 characters
    if (name.trim().length >= 3 && !selectedFood) {
      const timer = setTimeout(() => {
        fetchExpirationSuggestion(name);
      }, 500); // Debounce

      return () => clearTimeout(timer);
    } else if (!name.trim()) {
      // Clear suggestion if name is cleared
      setSuggestedExpiration(null);
      setExpirationConfidence(null);
    }
  }, [name, selectedFood, isOpen, storageType, isOpened, fetchExpirationSuggestion]);
  
  // Re-fetch expiration when storage type or opened status changes (if we have a name)
  useEffect(() => {
    if (!isOpen || !name.trim() || name.trim().length < 3) return;
    
    const timer = setTimeout(() => {
      fetchExpirationSuggestion(name, selectedFood);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [storageType, isOpened, name, selectedFood, isOpen, fetchExpirationSuggestion]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Validate form
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

    // Validate expiration date is not in the past
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
      await onCreate({
        name: name.trim(),
        quantity: quantityNum,
        expiration_date: expirationDate || null,
        storage_type: storageType,
        is_opened: isOpened,
      });

      // Reset form and close modal on success
      setName("");
      setQuantity("1");
      setExpirationDate("");
      setError(null);
      setSuggestedExpiration(null);
      setExpirationConfidence(null);
      setRecommendedStorage(null);
      setSelectedFood(null);
      setSearchQuery("");
      setSearchResults([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting && !isPending) {
      setName("");
      setQuantity("1");
      setExpirationDate("");
      setStorageType("pantry");
      setIsOpened(false);
      setError(null);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedFood(null);
      setShowResults(false);
      setSuggestedExpiration(null);
      setExpirationConfidence(null);
      onClose();
    }
  };

  const handleSelectFood = (food: any) => {
    setSelectedFood(food);
    const foodName = food.description || food.name || "";
    setName(foodName);
    setSearchQuery(foodName);
    setShowResults(false);
    // Suggest expiration for selected food (pass USDA data if available)
    if (foodName.trim()) {
      fetchExpirationSuggestion(foodName, food);
    }
  };

  // Get today's date in YYYY-MM-DD format for the date input min attribute
  const today = new Date().toISOString().split("T")[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Add Item to Pantry</h2>
          <button
            onClick={handleClose}
            disabled={submitting || isPending}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* USDA Food Search */}
          <div className="relative">
            <label htmlFor="food-search" className="block text-sm font-medium text-gray-700 mb-1">
              Search Food Database <span className="text-red-500">*</span>
            </label>
            <input
              id="food-search"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedFood(null);
              }}
              placeholder="Type to search (e.g., milk, bread, eggs)..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
              disabled={submitting || isPending}
              autoFocus
            />
            {searching && (
              <div className="absolute right-3 top-9 text-gray-400">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
            
            {/* Search Results Dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((food, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectFood(food)}
                    className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <div className="font-medium text-sm text-gray-800">{food.description}</div>
                    <div className="text-xs text-gray-500">
                      {food.brandName && `${food.brandName} • `}
                      {food.dataType}
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {showResults && searchResults.length === 0 && !searching && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                <p className="text-sm text-gray-500">No results found. Try a different search term.</p>
              </div>
            )}
          </div>

          {/* Selected Food Info */}
          {selectedFood && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800">✓ Selected: {selectedFood.description}</p>
              <p className="text-xs text-green-600 mt-1">Nutritional data will be automatically saved</p>
            </div>
          )}

          {/* Item Name (hidden, auto-filled) */}
          <input type="hidden" value={name} />

          {/* Quantity */}
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
              disabled={submitting || isPending}
            />
          </div>

          {/* Storage Type */}
          <div>
            <label htmlFor="storage-type" className="block text-sm font-medium text-gray-700 mb-1">
              Storage Location <span className="text-red-500">*</span>
            </label>
            <select
              id="storage-type"
              value={storageType}
              onChange={(e) => {
                setStorageType(e.target.value as "pantry" | "fridge" | "freezer");
                // Re-fetch expiration suggestion when storage type changes
                if (name.trim().length >= 3) {
                  fetchExpirationSuggestion(name, selectedFood);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
              disabled={submitting || isPending}
            >
              <option value="pantry">Pantry / Room Temperature</option>
              <option value="fridge">Refrigerator</option>
              <option value="freezer">Freezer</option>
            </select>
            {recommendedStorage && recommendedStorage === storageType && expirationConfidence && expirationConfidence !== "low" && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Recommended storage location based on item type
              </p>
            )}
            {recommendedStorage && recommendedStorage !== storageType && (
              <p className="text-xs text-amber-600 mt-1">
                💡 Recommended: {recommendedStorage === "fridge" ? "Refrigerator" : recommendedStorage === "freezer" ? "Freezer" : "Pantry"}
              </p>
            )}
          </div>

          {/* Opened/Closed Status */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isOpened}
                onChange={(e) => {
                  setIsOpened(e.target.checked);
                  // Re-fetch expiration suggestion when opened status changes
                  if (name.trim().length >= 3) {
                    fetchExpirationSuggestion(name, selectedFood);
                  }
                }}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                disabled={submitting || isPending}
              />
              <span className="text-sm font-medium text-gray-700">
                Item has been opened
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Opened items typically have shorter shelf life
            </p>
          </div>

          {/* Expiration Date */}
          <div>
            <label htmlFor="expiration-date" className="block text-sm font-medium text-gray-700 mb-1">
              Expiration Date <span className="text-gray-500 text-xs">(optional)</span>
              {suggestingExpiration && (
                <span className="ml-2 text-xs text-blue-600">Suggesting...</span>
              )}
            </label>
            <div className="relative">
              <input
                id="expiration-date"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                min={today}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
                disabled={submitting || isPending}
              />
              {suggestedExpiration && expirationDate === suggestedExpiration && expirationConfidence && (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs text-green-600">
                    ✓ Suggested expiration
                  </span>
                  {expirationConfidence === "high" && (
                    <span className="text-xs text-green-700 font-medium">(High confidence)</span>
                  )}
                  {expirationConfidence === "medium" && (
                    <span className="text-xs text-blue-600">(Medium confidence)</span>
                  )}
                  {expirationConfidence === "low" && (
                    <span className="text-xs text-yellow-600">(Estimate - you may want to adjust)</span>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {suggestedExpiration && expirationDate !== suggestedExpiration
                ? `Suggested: ${new Date(suggestedExpiration).toLocaleDateString()} - Click to use`
                : "Leave empty for non-perishable items"}
            </p>
            {suggestedExpiration && expirationDate !== suggestedExpiration && (
              <button
                type="button"
                onClick={() => setExpirationDate(suggestedExpiration)}
                className="mt-1 text-xs text-blue-600 hover:text-blue-700 underline"
              >
                Use suggested date
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting || isPending}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || isPending || !name.trim()}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting || isPending ? "Adding..." : "Add Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

