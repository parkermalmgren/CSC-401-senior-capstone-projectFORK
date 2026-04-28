// data/pantry-items.ts
export type PantryItem = {
  id: string;
  name: string;
  status: "fresh" | "expiring" | "expired";
  addedAt: string;           // ISO date
  expiresInDays?: number;
  /** Pantry quantity from backend (optional; used e.g. when adding to shopping list) */
  quantity?: number;
};

export const pantryItems: PantryItem[] = [
  {
    id: "1",
    name: "Chicken Breast",
    status: "fresh",
    addedAt: "2025-10-10",
    expiresInDays: 6
  },
  {
    id: "2",
    name: "Strawberries",
    status: "expiring",
    addedAt: "2025-10-13",
    expiresInDays: 1
  },
  {
    id: "3",
    name: "Canned Beans",
    status: "fresh",
    addedAt: "2025-10-01",
    expiresInDays: 365
  },
  {
    id: "4",
    name: "Ground Beef",
    status: "expiring",
    addedAt: "2025-10-14",
    expiresInDays: 2
  },
  {
    id: "5",
    name: "Avocados",
    status: "expired",
    addedAt: "2025-10-05",
    expiresInDays: -1
  },
  {
    id: "6",
    name: "Chicken Broth",
    status: "fresh",
    addedAt: "2025-10-12",
    expiresInDays: 120
  },
  {
    id: "7",
    name: "Bread",
    status: "expiring",
    addedAt: "2025-10-14",
    expiresInDays: 1
  },
  {
    id: "8",
    name: "Bananas",
    status: "expiring",
    addedAt: "2025-10-13",
    expiresInDays: 2
  }
];

