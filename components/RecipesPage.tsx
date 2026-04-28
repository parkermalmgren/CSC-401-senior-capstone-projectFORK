"use client";

import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { getItems, getAuthToken } from "@/lib/api";
import {
  getRecipesByIngredients,
  type RecipeByIngredients,
} from "@/lib/api";

const MAX_INGREDIENTS = 15;
const DEFAULT_RECIPE_NUMBER = 12;

const dietFilters = [
  { id: "", label: "Any" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten free", label: "Gluten-free" },
];

export default function RecipesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDiet, setSelectedDiet] = useState<string>("");
  const [recipes, setRecipes] = useState<RecipeByIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ingredientsUsed, setIngredientsUsed] = useState<string>("");
  const [households, setHouseholds] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>(null);
  const [missingPopupRecipeId, setMissingPopupRecipeId] = useState<number | null>(null);
  const [prioritizeExpiring, setPrioritizeExpiring] = useState(false);
  const [householdError, setHouseholdError] = useState<string | null>(null);

  const fetchHouseholds = async () => {
    setHouseholdError(null);
    try {
      const token = (await getAuthToken()) ?? "";
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${base}/api/households`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.households || [];
        setHouseholds(list);
        if (list.length > 0) setSelectedHousehold(list[0].id);
      } else {
        setHouseholdError(
          res.status === 401
            ? "Sign in again to load your households."
            : "Could not load households. Recipe filters may be limited."
        );
      }
    } catch (err) {
      setHouseholdError(
        err instanceof Error ? err.message : "Could not load households. Check your connection."
      );
    }
  };

  const fetchRecipes = async (ingredients: string, diet: string, prioritize: boolean) => {
    if (!ingredients.trim()) {
      setRecipes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getRecipesByIngredients({
        ingredients,
        number: DEFAULT_RECIPE_NUMBER,
        ranking: 1,
        diet: diet || undefined,
        prioritizeExpiring: prioritize,
        householdId: selectedHousehold || undefined,
      });
      setRecipes(response.recipes || []);
      setIngredientsUsed(ingredients);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recipes");
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHouseholds();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const response = await getItems({
          page_size: 100,
          household_id: selectedHousehold || undefined,
        });
        if (cancelled) return;
        const names = (response.items || [])
          .map((i) => i.name.trim())
          .filter(Boolean);
        const unique = Array.from(new Set(names)).slice(0, MAX_INGREDIENTS);
        const ingredients = unique.join(",");
        await fetchRecipes(ingredients, selectedDiet, prioritizeExpiring);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load pantry");
          setRecipes([]);
          setLoading(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedHousehold]);

  useEffect(() => {
    if (!ingredientsUsed && !loading) return;
    if (ingredientsUsed) fetchRecipes(ingredientsUsed, selectedDiet, prioritizeExpiring);
  }, [selectedDiet, prioritizeExpiring]);

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, searchQuery]);

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 grid gap-4 sm:gap-8">
      <header className="text-center grid gap-2 sm:gap-3">
        <div className="mx-auto">
          <Image
            src="/Recipe_Magic.png"
            width={56}
            height={56}
            alt="Recipes"
            className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
          />
        </div>
        <h1 className="text-xl sm:text-3xl font-semibold text-slate-800">
          Recipes
        </h1>
        <p className="text-xs sm:text-base text-slate-600 px-2 max-w-xl mx-auto">
          Find meals you can make with what&apos;s in your pantry. Results are
          based on your current ingredients.
        </p>
        {householdError && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-xl mx-auto">
            {householdError}
          </p>
        )}
        {households.length > 1 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <label className="text-sm font-medium text-slate-700">
              Pantry:
            </label>
            <select
              value={selectedHousehold ?? ""}
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

      <section className="card p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={prioritizeExpiring}
              onChange={(e) => setPrioritizeExpiring(e.target.checked)}
              disabled={loading}
              className="rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
              Prioritize recipes that use soon-to-expire items
            </span>
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recipe names..."
              className="border border-slate-300 rounded-full px-4 py-2.5 text-sm flex-1 min-w-0 bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm text-slate-600 font-medium">
                Diet:
              </span>
              {dietFilters.map((d) => (
                <button
                  key={d.id || "any"}
                  type="button"
                  onClick={() => setSelectedDiet(d.id)}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                    selectedDiet === d.id
                      ? "bg-green-600 text-white"
                      : "bg-white border border-slate-300 text-slate-700 hover:border-green-500 hover:text-green-700"
                  }`}
                  disabled={loading}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          {ingredientsUsed && (
            <p className="text-xs text-slate-500">
              Using ingredients: {ingredientsUsed.replace(/,/g, ", ")}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-3 sm:mb-4">
          Suggested recipes
        </h2>

        {loading && (
          <div className="text-center py-12 text-slate-500">
            Loading recipes from your pantry…
          </div>
        )}

        {error && !loading && (
          <div className="card p-6 text-center">
            <p className="text-red-600 mb-2">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm text-green-600 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && !ingredientsUsed && (
          <div className="card p-8 text-center text-slate-600">
            <p>
              Add items to your pantry to get recipe suggestions based on what
              you have.
            </p>
            <a href="/pantry" className="text-green-600 hover:underline mt-2 inline-block">
              Go to Pantry →
            </a>
          </div>
        )}

        {!loading && !error && ingredientsUsed && filteredRecipes.length === 0 && (
          <div className="card p-8 text-center text-slate-600">
            <p>
              {searchQuery
                ? "No recipes match your search."
                : "No recipes found for these ingredients. Try adding more pantry items or changing the diet filter."}
            </p>
          </div>
        )}

        {!loading && !error && filteredRecipes.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRecipes.map((recipe) => (
              <article
                key={recipe.id}
                className="card p-0 overflow-hidden flex flex-col hover:shadow-lg transition-shadow"
              >
                <div className="aspect-video bg-slate-200 relative">
                  {recipe.image ? (
                    <Image
                      src={recipe.image}
                      alt=""
                      width={400}
                      height={225}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                      No image
                    </div>
                  )}
                  {(() => {
                    const missingCount =
                      recipe.missedIngredients?.length ?? recipe.missedIngredientCount ?? 0;
                    return missingCount > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setMissingPopupRecipeId((id) => (id === recipe.id ? null : recipe.id));
                        }}
                        className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-800/80 text-white text-xs hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        +{missingCount} missing
                      </button>
                    ) : null;
                  })()}
                </div>
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <h3 className="font-semibold text-slate-800 line-clamp-2">
                    {recipe.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {recipe.readyInMinutes != null && (
                      <span>{recipe.readyInMinutes} min</span>
                    )}
                    {recipe.servings != null && (
                      <span>{recipe.servings} servings</span>
                    )}
                  </div>
                  {recipe.missedIngredients && recipe.missedIngredients.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setMissingPopupRecipeId((id) => (id === recipe.id ? null : recipe.id));
                      }}
                      className="text-xs text-slate-500 hover:text-green-600 hover:underline text-left"
                    >
                      Missing:{" "}
                      {recipe.missedIngredients
                        .slice(0, 3)
                        .map((m) => m.name || m.original || "")
                        .filter(Boolean)
                        .join(", ")}
                      {recipe.missedIngredients.length > 3 &&
                        ` +${recipe.missedIngredients.length - 3} more`}{" "}
                      (click to see all)
                    </button>
                  )}
                  {recipe.summary && (
                    <p
                      className="text-sm text-slate-600 line-clamp-2"
                      dangerouslySetInnerHTML={{
                        __html: recipe.summary.replace(/<[^>]+>/g, ""),
                      }}
                    />
                  )}
                  {recipe.sourceUrl && (
                    <a
                      href={recipe.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto text-sm text-green-600 hover:underline font-medium"
                    >
                      View recipe →
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Missing ingredients popup */}
        {missingPopupRecipeId != null && (() => {
          const recipe = filteredRecipes.find((r) => r.id === missingPopupRecipeId);
          if (!recipe?.missedIngredients?.length) return null;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setMissingPopupRecipeId(null)}
              role="dialog"
              aria-label="Missing ingredients"
            >
              <div
                className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4 max-h-[70vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-semibold text-slate-800 mb-1 line-clamp-2">
                  {recipe.title}
                </h3>
                <p className="text-sm text-slate-600 mb-3">Ingredients you don&apos;t have:</p>
                <ul className="text-sm text-slate-700 space-y-1 overflow-y-auto flex-1">
                  {recipe.missedIngredients.map((m, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-slate-400 mt-0.5">•</span>
                      <span>{m.original ?? m.name ?? "—"}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setMissingPopupRecipeId(null)}
                  className="mt-4 w-full py-2 rounded-lg bg-slate-200 text-slate-800 font-medium hover:bg-slate-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
