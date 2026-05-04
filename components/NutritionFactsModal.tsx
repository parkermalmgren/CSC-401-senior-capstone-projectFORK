// components/NutritionFactsModal.tsx
"use client";

import { useState, useEffect } from "react";
import { getAuthToken } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface NutritionFactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  itemId: string;
  quantity?: number;
}

interface NutritionData {
  name: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  saturatedFat?: number;
  transFat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  fiber?: number;
  sugar?: number;
  addedSugar?: number;
  vitaminD?: number;
  calcium?: number;
  iron?: number;
  vitaminA?: number;
  vitaminC?: number;
  servingSize?: string;
}

export default function NutritionFactsModal({ isOpen, onClose, itemName, itemId, quantity = 1 }: NutritionFactsModalProps) {
  const [loading, setLoading] = useState(false);
  const [nutritionData, setNutritionData] = useState<NutritionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && itemName) {
      fetchNutritionFacts();
    }
  }, [isOpen, itemName]);

  const fetchNutritionFacts = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getAuthToken();
      const response = await fetch(
        `${API_BASE_URL}/api/nutrition/${encodeURIComponent(itemName)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch nutrition facts');
      }

      const data = await response.json();
      setNutritionData(data);
    } catch (err) {
      console.error('Error fetching nutrition facts:', err);
      setError('Unable to load nutrition facts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Nutrition Facts"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Nutrition Facts</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <p className="mt-2 text-gray-600">Loading nutrition facts...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && nutritionData && (
            <div className="space-y-4">
              <div className="border-b-8 border-black pb-2">
                <h3 className="text-2xl font-bold">{nutritionData.name}</h3>
                {quantity > 1 && (
                  <p className="text-sm text-gray-600 font-semibold">For {quantity} serving{quantity > 1 ? 's' : ''}</p>
                )}
                {nutritionData.servingSize && (
                  <p className="text-sm text-gray-600">Per Serving: {nutritionData.servingSize}</p>
                )}
              </div>

              <div className="border-b-4 border-black pb-2">
                <div className="flex justify-between items-end">
                  <span className="font-bold text-lg">Calories</span>
                  <span className="font-bold text-3xl">{nutritionData.calories ? Math.round(nutritionData.calories * quantity) : 'N/A'}</span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-300 py-2">
                  <span className="font-semibold">Total Fat</span>
                  <span className="font-semibold">{nutritionData.fat ? `${Math.round(nutritionData.fat * quantity * 10) / 10}g` : 'N/A'}</span>
                </div>

                {nutritionData.saturatedFat !== undefined && nutritionData.saturatedFat > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2 pl-4">
                    <span>Saturated Fat</span>
                    <span>{Math.round(nutritionData.saturatedFat * quantity * 10) / 10}g</span>
                  </div>
                )}

                {nutritionData.transFat !== undefined && nutritionData.transFat > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2 pl-4">
                    <span>Trans Fat</span>
                    <span>{Math.round(nutritionData.transFat * quantity * 10) / 10}g</span>
                  </div>
                )}

                {nutritionData.cholesterol !== undefined && nutritionData.cholesterol > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span className="font-semibold">Cholesterol</span>
                    <span className="font-semibold">{Math.round(nutritionData.cholesterol * quantity * 10) / 10}mg</span>
                  </div>
                )}

                {nutritionData.sodium !== undefined && nutritionData.sodium > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span className="font-semibold">Sodium</span>
                    <span className="font-semibold">{Math.round(nutritionData.sodium * quantity * 10) / 10}mg</span>
                  </div>
                )}

                <div className="flex justify-between border-b border-gray-300 py-2">
                  <span className="font-semibold">Total Carbohydrate</span>
                  <span className="font-semibold">{nutritionData.carbs ? `${Math.round(nutritionData.carbs * quantity * 10) / 10}g` : 'N/A'}</span>
                </div>

                {nutritionData.fiber !== undefined && nutritionData.fiber > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2 pl-4">
                    <span>Dietary Fiber</span>
                    <span>{Math.round(nutritionData.fiber * quantity * 10) / 10}g</span>
                  </div>
                )}

                {nutritionData.sugar !== undefined && nutritionData.sugar > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2 pl-4">
                    <span>Total Sugars</span>
                    <span>{Math.round(nutritionData.sugar * quantity * 10) / 10}g</span>
                  </div>
                )}

                {nutritionData.addedSugar !== undefined && nutritionData.addedSugar > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2 pl-8">
                    <span className="text-xs">Includes Added Sugars</span>
                    <span className="text-xs">{Math.round(nutritionData.addedSugar * quantity * 10) / 10}g</span>
                  </div>
                )}

                <div className="flex justify-between border-b-4 border-black py-2">
                  <span className="font-semibold">Protein</span>
                  <span className="font-semibold">{nutritionData.protein ? `${Math.round(nutritionData.protein * quantity * 10) / 10}g` : 'N/A'}</span>
                </div>

                {nutritionData.vitaminD !== undefined && nutritionData.vitaminD > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span>Vitamin D</span>
                    <span>{Math.round(nutritionData.vitaminD * quantity * 10) / 10}mcg</span>
                  </div>
                )}

                {nutritionData.calcium !== undefined && nutritionData.calcium > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span>Calcium</span>
                    <span>{Math.round(nutritionData.calcium * quantity * 10) / 10}mg</span>
                  </div>
                )}

                {nutritionData.iron !== undefined && nutritionData.iron > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span>Iron</span>
                    <span>{Math.round(nutritionData.iron * quantity * 10) / 10}mg</span>
                  </div>
                )}

                {nutritionData.potassium !== undefined && nutritionData.potassium > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span>Potassium</span>
                    <span>{Math.round(nutritionData.potassium * quantity * 10) / 10}mg</span>
                  </div>
                )}

                {nutritionData.vitaminA !== undefined && nutritionData.vitaminA > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span>Vitamin A</span>
                    <span>{Math.round(nutritionData.vitaminA * quantity * 10) / 10}mcg</span>
                  </div>
                )}

                {nutritionData.vitaminC !== undefined && nutritionData.vitaminC > 0 && (
                  <div className="flex justify-between border-b border-gray-300 py-2">
                    <span>Vitamin C</span>
                    <span>{Math.round(nutritionData.vitaminC * quantity * 10) / 10}mg</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-4">
                * Nutritional information is approximate and based on USDA FoodData Central.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 pt-0 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
