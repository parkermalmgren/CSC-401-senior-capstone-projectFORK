// lib/api.ts
// API service for pantry items

import { API_BASE_URL } from "./config";

// Types matching backend response
export interface BackendItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  expiration_date: string | null;
  storage_type?: string; // "pantry", "fridge", "freezer"
  is_opened?: boolean;
  added_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateItemRequest {
  name: string;
  quantity?: number;
  expiration_date?: string | null; // ISO date string
  storage_type?: string; // "pantry", "fridge", "freezer"
  is_opened?: boolean;
}

export interface UpdateItemRequest {
  name?: string;
  quantity?: number;
  expiration_date?: string | null;
  storage_type?: string; // "pantry", "fridge", "freezer"
  is_opened?: boolean;
}

// In-memory token storage — survives navigation but not page refresh.
// On refresh, getAuthToken() re-hydrates from the HttpOnly cookie via /api/auth/token.
let _authToken: string | null = null;

/** Store the JWT in memory after login/signup. */
export function setAuthToken(token: string): void {
  _authToken = token;
}

/** Clear the in-memory token on logout. */
export function clearAuthToken(): void {
  _authToken = null;
}

/**
 * Return the current JWT.
 * Uses the in-memory value when available; otherwise asks the Next.js
 * /api/auth/token route to read the HttpOnly cookie server-side.
 */
export async function getAuthToken(): Promise<string | null> {
  if (_authToken) return _authToken;

  // Re-hydrate from the HttpOnly cookie (requires a same-origin server round-trip)
  try {
    const res = await fetch("/api/auth/token", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        _authToken = data.token;
        return _authToken;
      }
    }
  } catch {
    // Not authenticated or network error
  }
  return null;
}

// Helper to handle authentication errors and redirect if needed
async function handleAuthError(status: number): Promise<void> {
  if (status === 401) {
    clearAuthToken();
    // Ask the server to clear the HttpOnly cookie
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Dispatch auth change event
    window.dispatchEvent(new Event("auth-change"));
    // Redirect to login after a brief delay to allow UI to update
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }, 100);
  }
}

// Helper to make authenticated API requests with automatic error handling
async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  // Handle authentication errors globally
  if (response.status === 401) {
    await handleAuthError(401);
    throw new Error("Authentication required. Please log in again.");
  }
  
  // Handle rate limiting errors with user-friendly messages
  if (response.status === 429) {
    let message = "Too many requests. Please wait a moment before trying again.";
    try {
      const data = await response.json();
      if (data.detail) {
        message = data.detail;
      }
    } catch {
      // Use default message if JSON parsing fails
    }
    throw new Error(message);
  }

  return response;
}

// Paginated response type
export interface PaginatedItemsResponse {
  items: BackendItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// API client functions
export async function getItems(options?: {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: "name" | "expiration_date" | "created_at" | "quantity" | "added_at";
  sort_order?: "asc" | "desc";
  expiring_soon?: boolean;
  household_id?: string;
}): Promise<PaginatedItemsResponse> {
  // Build query parameters
  const params = new URLSearchParams();
  if (options?.page) params.append("page", options.page.toString());
  if (options?.page_size) params.append("page_size", options.page_size.toString());
  if (options?.search) params.append("search", options.search);
  if (options?.sort_by) params.append("sort_by", options.sort_by);
  if (options?.sort_order) params.append("sort_order", options.sort_order);
  if (options?.expiring_soon !== undefined) params.append("expiring_soon", options.expiring_soon.toString());
  if (options?.household_id) params.append("household_id", options.household_id);

  const url = `${API_BASE_URL}/api/items${params.toString() ? `?${params.toString()}` : ""}`;

  const response = await authenticatedFetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to fetch items" }));
    throw new Error(error.detail || "Failed to fetch items");
  }

  const data = await response.json();

  // Validate response structure
  if (!data || typeof data !== 'object') {
    throw new Error("Invalid response format from API");
  }

  // Handle both paginated and array responses (for backward compatibility)
  if (Array.isArray(data)) {
    // Legacy format - convert to paginated format
    return {
      items: data,
      total: data.length,
      page: 1,
      page_size: data.length,
      total_pages: 1
    };
  }

  // New paginated format - ensure items array exists
  if (!data.items) {
    throw new Error("Response missing items array. Response: " + JSON.stringify(data));
  }

  if (!Array.isArray(data.items)) {
    throw new Error("Response items is not an array");
  }

  return data;
}

// Recipe types (Spoonacular via backend proxy)
export interface RecipeByIngredients {
  id: number;
  title: string;
  image: string | null;
  usedIngredientCount: number;
  missedIngredientCount: number;
  missedIngredients: Array<{ name: string; original?: string }>;
  readyInMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  summary?: string;
}

export interface RecipesByIngredientsResponse {
  recipes: RecipeByIngredients[];
}

export async function getRecipesByIngredients(options: {
  ingredients: string;
  number?: number;
  ranking?: 1 | 2;
  diet?: string | null;
  prioritizeExpiring?: boolean;
  householdId?: string | null;
}): Promise<RecipesByIngredientsResponse> {
  const params = new URLSearchParams();
  params.set("ingredients", options.ingredients);
  if (options.number != null) params.set("number", options.number.toString());
  if (options.ranking != null) params.set("ranking", options.ranking.toString());
  if (options.diet) params.set("diet", options.diet);
  if (options.prioritizeExpiring) params.set("prioritize_expiring", "true");
  if (options.householdId) params.set("household_id", options.householdId);

  const url = `${API_BASE_URL}/api/recipes/by-ingredients?${params.toString()}`;
  const response = await authenticatedFetch(url, { method: "GET" });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to fetch recipes" }));
    throw new Error(error.detail || "Failed to fetch recipes");
  }

  return response.json();
}

export async function getItem(itemId: string): Promise<BackendItem> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/items/${itemId}`, {
    method: "GET",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Item not found");
    }
    const error = await response.json().catch(() => ({ detail: "Failed to fetch item" }));
    throw new Error(error.detail || "Failed to fetch item");
  }

  return response.json();
}

export async function createItem(item: CreateItemRequest): Promise<BackendItem> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/items`, {
    method: "POST",
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to create item" }));
    throw new Error(error.detail || "Failed to create item");
  }

  return response.json();
}

export async function updateItem(itemId: string, item: UpdateItemRequest): Promise<BackendItem> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Item not found");
    }
    const error = await response.json().catch(() => ({ detail: "Failed to update item" }));
    throw new Error(error.detail || "Failed to update item");
  }

  return response.json();
}

export async function deleteItem(itemId: string): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/items/${itemId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Item not found");
    }
    const error = await response.json().catch(() => ({ detail: "Failed to delete item" }));
    throw new Error(error.detail || "Failed to delete item");
  }
}

export async function getExpiringItems(
  days: number = 7,
  options?: {
    page?: number;
    page_size?: number;
  }
): Promise<PaginatedItemsResponse> {
  // Build query parameters
  const params = new URLSearchParams();
  params.append("days", days.toString());
  if (options?.page) params.append("page", options.page.toString());
  if (options?.page_size) params.append("page_size", options.page_size.toString());

  const response = await authenticatedFetch(`${API_BASE_URL}/api/items/expiring/soon?${params.toString()}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to fetch expiring items" }));
    throw new Error(error.detail || "Failed to fetch expiring items");
  }

  return response.json();
}

// Optimistic update utilities
export interface OptimisticUpdateCallbacks<T> {
  onOptimistic: () => void; // Called immediately before API call
  onSuccess: (result: T) => void; // Called on successful API response
  onError: (error: Error, rollback: () => void) => void; // Called on error, with rollback function
}

/**
 * Executes an API call with optimistic UI updates
 * Updates the UI immediately, then confirms or rolls back based on API response
 */
export async function withOptimisticUpdate<T>(
  apiCall: () => Promise<T>,
  callbacks: OptimisticUpdateCallbacks<T>
): Promise<T> {
  const { onOptimistic, onSuccess, onError } = callbacks;
  
  // Store current state for rollback (if needed)
  let rollbackCalled = false;
  const rollback = () => {
    if (!rollbackCalled) {
      rollbackCalled = true;
      // Trigger a re-fetch or reload
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("items-refresh"));
      }
    }
  };

  try {
    // Update UI optimistically
    onOptimistic();
    
    // Execute API call
    const result = await apiCall();
    
    // Update UI with confirmed data
    onSuccess(result);
    
    return result;
  } catch (error) {
    // Rollback optimistic update
    const err = error instanceof Error ? error : new Error(String(error));
    onError(err, rollback);
    throw err;
  }
}

// Profile types
export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
}

export interface ProfileStats {
  total_items: number;
  expiring_items: number;
  expired_items: number;
  account_created: string | null;
}

// Profile API functions
export async function getProfile(): Promise<Profile> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/profile`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to fetch profile" }));
    throw new Error(error.detail || "Failed to fetch profile");
  }

  return response.json();
}

export async function updateProfile(profile: ProfileUpdate): Promise<Profile> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/profile`, {
    method: "PUT",
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to update profile" }));
    throw new Error(error.detail || "Failed to update profile");
  }

  return response.json();
}

// Expiration notification preferences (Notify me when items are close to expire)
export type NotificationChannel = "email" | "sms";

export interface NotificationPreferences {
  channel: NotificationChannel | null;
  contact: string | null;
}

export interface NotificationPreferencesUpdate {
  channel: NotificationChannel;
  contact: string;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/notification-preferences`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to load notification preferences" }));
    throw new Error(error.detail || "Failed to load notification preferences");
  }

  return response.json();
}

export async function updateNotificationPreferences(
  data: NotificationPreferencesUpdate
): Promise<NotificationPreferences> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/notification-preferences`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to save notification preferences" }));
    throw new Error(error.detail || "Failed to save notification preferences");
  }

  return response.json();
}

/** Stop expiration reminder emails (removes user from notifications). */
export async function deleteNotificationPreferences(): Promise<{ message: string }> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/notification-preferences`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to cancel notifications" }));
    throw new Error(error.detail || "Failed to cancel notifications");
  }

  return response.json();
}

/** Request to send expiration reminder (for items expiring within N days). */
export async function sendExpirationReminder(days?: number): Promise<{ message: string; sent: number; channel?: string }> {
  const params = days != null ? `?days=${days}` : "";
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/notifications/send-expiration-reminders${params}`,
    { method: "POST" }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to send reminder" }));
    throw new Error(error.detail || "Failed to send reminder");
  }

  return response.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/profile/change-password`, {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to change password" }));
    throw new Error(error.detail || "Failed to change password");
  }
}

export async function getProfileStats(): Promise<ProfileStats> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/profile/stats`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to fetch stats" }));
    throw new Error(error.detail || "Failed to fetch stats");
  }

  return response.json();
}

// Expiration suggestion types
export interface ExpirationSuggestionRequest {
  name: string;
  storage_type?: string;
  purchased_date?: string | null;
  is_opened?: boolean;
  usda_fdc_id?: number | null;
  usda_food_category?: string | null;
}

export interface ExpirationSuggestionResponse {
  suggested_date: string | null;
  days_from_now: number | null;
  confidence: "high" | "medium" | "low";
  category: string | null;
  recommended_storage_type: string | null; // "pantry", "fridge", "freezer"
}

export async function suggestExpirationDate(
  request: ExpirationSuggestionRequest
): Promise<ExpirationSuggestionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/items/suggest-expiration`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to suggest expiration" }));
    throw new Error(error.detail || "Failed to suggest expiration");
  }

  return response.json();
}

// Helper to convert backend item to frontend format
export interface WasteSavedResponse {
  items_saved: number;
  items_expiring_soon_saved: number;
  this_month: number;
  all_time: number;
}

export async function getWasteSaved(): Promise<WasteSavedResponse> {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/waste-saved`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Failed to fetch waste saved" }));
    throw new Error(error.detail || "Failed to fetch waste saved");
  }
  
  return response.json();
}

export function backendItemToFrontend(item: BackendItem) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let status: "fresh" | "expiring" | "expired" = "fresh";
  let expiresInDays: number | undefined;

  if (item.expiration_date) {
    const expDate = new Date(item.expiration_date);
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    expiresInDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (expiresInDays < 0) {
      status = "expired";
    } else if (expiresInDays <= 3) {
      status = "expiring";
    } else {
      status = "fresh";
    }
  }

  return {
    id: item.id,
    name: item.name,
    status,
    addedAt: item.added_at.split("T")[0], // Extract date part
    expiresInDays,
  };
}

