"""
Integration-style tests for shopping list endpoints with Supabase mocked via table() routing.
Follows api/tests/conftest.py: uses session ``main_module`` and patches ``main_module.supabase`` per test.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

USER_ID = "11111111-1111-1111-1111-111111111111"
HOUSEHOLD_ID = 42
ITEM_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def _relation_default_household_mock():
    """relation_househould: select ... eq user ... limit 1 -> one household."""
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.limit.return_value = m
    m.execute.return_value = SimpleNamespace(data=[{"household_id": HOUSEHOLD_ID}])
    return m


def _shopping_list_select_rows_mock(rows):
    """shopping_list_items: select * eq household_id order created_at desc."""
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.order.return_value = m
    m.execute.return_value = SimpleNamespace(data=rows)
    return m


def _shopping_list_insert_mock(returned_row):
    m = MagicMock()
    ins = MagicMock()
    ins.execute.return_value = SimpleNamespace(data=[returned_row])
    m.insert.return_value = ins
    return m


def _shopping_list_select_by_id_mock(row):
    """select * eq id (single eq chain)."""
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[row] if row else [])
    return m


def _shopping_list_update_mock(returned_row):
    m = MagicMock()
    m.update.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[returned_row] if returned_row else [])
    return m


def _shopping_list_delete_select_mock(household_id_val):
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[{"household_id": household_id_val}])
    return m


def _shopping_list_delete_mock():
    m = MagicMock()
    m.delete.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[])
    return m


def _patch_supabase_table_sequence(main_module, *table_mocks):
    supa = MagicMock()
    supa.table.side_effect = list(table_mocks)
    main_module.supabase = supa


@pytest.fixture
def authed_client(main_module):
    """JWT dependency bypassed; returns fixed USER_ID."""

    def override_get_user_id():
        return USER_ID

    main_module.app.dependency_overrides[main_module.get_user_id] = override_get_user_id
    client = TestClient(main_module.app)
    yield client
    main_module.app.dependency_overrides.clear()


def test_get_shopping_list_returns_items(authed_client, main_module):
    row = {
        "id": ITEM_ID,
        "user_id": USER_ID,
        "household_id": HOUSEHOLD_ID,
        "name": "milk",
        "quantity": "1 gal",
        "checked": False,
        "created_at": "2026-01-01T12:00:00Z",
        "updated_at": "2026-01-01T12:00:00Z",
    }
    _patch_supabase_table_sequence(
        main_module,
        _relation_default_household_mock(),
        _shopping_list_select_rows_mock([row]),
    )

    r = authed_client.get("/api/shopping-list")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == [row]


def test_post_shopping_list_creates_item(authed_client, main_module):
    created = {
        "id": ITEM_ID,
        "user_id": USER_ID,
        "household_id": HOUSEHOLD_ID,
        "name": "butter",
        "quantity": None,
        "checked": False,
        "created_at": "2026-01-02T12:00:00Z",
        "updated_at": "2026-01-02T12:00:00Z",
    }
    _patch_supabase_table_sequence(
        main_module,
        _relation_default_household_mock(),
        _shopping_list_insert_mock(created),
    )

    r = authed_client.post("/api/shopping-list", json={"name": "butter", "quantity": None})
    assert r.status_code == 201
    assert r.json() == created


def test_put_shopping_list_updates_item(authed_client, main_module):
    existing = {
        "id": ITEM_ID,
        "user_id": USER_ID,
        "household_id": HOUSEHOLD_ID,
        "name": "butter",
        "quantity": None,
        "checked": False,
        "created_at": "2026-01-02T12:00:00Z",
        "updated_at": "2026-01-02T12:00:00Z",
    }
    updated = {**existing, "checked": True, "name": "butter", "updated_at": "2026-01-03T12:00:00Z"}
    _patch_supabase_table_sequence(
        main_module,
        _relation_default_household_mock(),
        _shopping_list_select_by_id_mock(existing),
        _shopping_list_update_mock(updated),
    )

    r = authed_client.put(
        f"/api/shopping-list/{ITEM_ID}",
        json={"checked": True},
    )
    assert r.status_code == 200
    assert r.json()["checked"] is True
    assert r.json()["id"] == ITEM_ID


def test_delete_shopping_list_item(authed_client, main_module):
    _patch_supabase_table_sequence(
        main_module,
        _relation_default_household_mock(),
        _shopping_list_delete_select_mock(HOUSEHOLD_ID),
        _shopping_list_delete_mock(),
    )

    r = authed_client.delete(f"/api/shopping-list/{ITEM_ID}")
    assert r.status_code == 204
    assert r.content == b""


def test_shopping_list_unauthorized_without_bearer(main_module):
    """No dependency override: missing Authorization -> 401."""
    main_module.app.dependency_overrides.clear()
    _patch_supabase_table_sequence(
        main_module,
        _relation_default_household_mock(),
        _shopping_list_select_rows_mock([]),
    )
    client = TestClient(main_module.app)
    r = client.get("/api/shopping-list")
    assert r.status_code == 401
    assert "Authentication" in r.json().get("detail", "")
