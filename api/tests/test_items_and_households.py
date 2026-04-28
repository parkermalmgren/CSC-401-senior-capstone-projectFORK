"""Tests for item CRUD roundtrip and household join endpoint."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

USER_ID = "33333333-3333-3333-3333-333333333333"
ITEM_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
HOUSEHOLD_ID = 7


def _items_insert_mock(returned_row):
    m = MagicMock()
    ins = MagicMock()
    ins.execute.return_value = SimpleNamespace(data=[returned_row])
    m.insert.return_value = ins
    return m


def _items_select_one_mock(row):
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[row] if row else [])
    return m


def _items_update_mock(returned_row):
    m = MagicMock()
    m.update.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[returned_row] if returned_row else [])
    return m


def _deleted_items_insert_mock():
    m = MagicMock()
    ins = MagicMock()
    ins.execute.return_value = SimpleNamespace(data=[{"ok": True}])
    m.insert.return_value = ins
    return m


def _items_delete_mock():
    m = MagicMock()
    m.delete.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[])
    return m


def _household_exists_mock():
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[{"id": HOUSEHOLD_ID, "name": "Test Home"}])
    return m


def _relation_member_check_empty_mock():
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.execute.return_value = SimpleNamespace(data=[])
    return m


def _relation_insert_mock():
    m = MagicMock()
    ins = MagicMock()
    ins.execute.return_value = SimpleNamespace(data=[{"user_id": USER_ID, "household_id": HOUSEHOLD_ID}])
    m.insert.return_value = ins
    return m


def _patch_supabase_table_sequence(main_module, *table_mocks):
    supa = MagicMock()
    supa.table.side_effect = list(table_mocks)
    main_module.supabase = supa


@pytest.fixture
def authed_client(main_module):
    def override_get_user_id():
        return USER_ID

    main_module.app.dependency_overrides[main_module.get_user_id] = override_get_user_id
    client = TestClient(main_module.app)
    yield client
    main_module.app.dependency_overrides.clear()


def test_items_crud_roundtrip(authed_client, main_module):
    created = {
        "id": ITEM_ID,
        "user_id": USER_ID,
        "name": "Milk",
        "quantity": 2,
        "expiration_date": None,
        "storage_type": "fridge",
        "is_opened": False,
        "added_at": "2026-01-01T10:00:00Z",
        "created_at": "2026-01-01T10:00:00Z",
        "updated_at": "2026-01-01T10:00:00Z",
    }
    updated = {**created, "quantity": 3, "updated_at": "2026-01-02T10:00:00Z"}

    _patch_supabase_table_sequence(
        main_module,
        _items_insert_mock(created),          # POST /api/items
        _items_select_one_mock(created),      # GET /api/items/{item_id}
        _items_select_one_mock(created),      # PUT pre-check
        _items_update_mock(updated),          # PUT update
        _items_select_one_mock(updated),      # DELETE load current item
        _deleted_items_insert_mock(),         # DELETE log deleted_items
        _items_delete_mock(),                 # DELETE item
    )

    r_create = authed_client.post(
        "/api/items",
        json={"name": "Milk", "quantity": 2, "storage_type": "fridge", "is_opened": False},
    )
    assert r_create.status_code == 201
    assert r_create.json()["id"] == ITEM_ID

    r_get = authed_client.get(f"/api/items/{ITEM_ID}")
    assert r_get.status_code == 200
    assert r_get.json()["name"] == "Milk"

    r_update = authed_client.put(f"/api/items/{ITEM_ID}", json={"quantity": 3})
    assert r_update.status_code == 200
    assert r_update.json()["quantity"] == 3

    r_delete = authed_client.delete(f"/api/items/{ITEM_ID}")
    assert r_delete.status_code == 204
    assert r_delete.content == b""


def test_household_join(authed_client, main_module):
    _patch_supabase_table_sequence(
        main_module,
        _household_exists_mock(),
        _relation_member_check_empty_mock(),
        _relation_insert_mock(),
    )

    r = authed_client.post("/api/households/join", json={"household_id": str(HOUSEHOLD_ID)})
    assert r.status_code == 200
    body = r.json()
    assert body["household_id"] == str(HOUSEHOLD_ID)
    assert "Successfully joined household" in body["message"]
