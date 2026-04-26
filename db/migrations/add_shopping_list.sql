-- Migration: Shopping list items (household-scoped, shared via relation_househould)
-- Apply in Supabase SQL editor or: psql $DATABASE_URL -f db/migrations/add_shopping_list.sql

CREATE TABLE IF NOT EXISTS shopping_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    household_id INTEGER NOT NULL REFERENCES public.household(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT,
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_household ON shopping_list_items(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_user ON shopping_list_items(user_id);

ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

-- Direct Supabase client access: members of the household may read rows
CREATE POLICY shopping_list_select ON shopping_list_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.relation_househould rh
            WHERE rh.household_id = shopping_list_items.household_id
              AND rh.user_id = auth.uid()
        )
    );

CREATE POLICY shopping_list_insert ON shopping_list_items
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.relation_househould rh
            WHERE rh.household_id = shopping_list_items.household_id
              AND rh.user_id = auth.uid()
        )
    );

CREATE POLICY shopping_list_update ON shopping_list_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.relation_househould rh
            WHERE rh.household_id = shopping_list_items.household_id
              AND rh.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.relation_househould rh
            WHERE rh.household_id = shopping_list_items.household_id
              AND rh.user_id = auth.uid()
        )
    );

CREATE POLICY shopping_list_delete ON shopping_list_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.relation_househould rh
            WHERE rh.household_id = shopping_list_items.household_id
              AND rh.user_id = auth.uid()
        )
    );

COMMENT ON TABLE shopping_list_items IS 'Per-household shopping list; backend uses service role; RLS applies to direct PostgREST access.';
