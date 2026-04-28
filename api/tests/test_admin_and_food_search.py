"""Admin allow-list and USDA food search auth tests (Supabase mocked where needed)."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

USER_ID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def authed_client(main_module):
    def override_get_user_id():
        return USER_ID

    main_module.app.dependency_overrides[main_module.get_user_id] = override_get_user_id
    client = TestClient(main_module.app)
    yield client
    main_module.app.dependency_overrides.clear()


def test_admin_users_requires_auth(main_module):
    client = TestClient(main_module.app)
    r = client.get("/api/admin/users")
    assert r.status_code == 401


def test_admin_users_forbidden_non_admin(authed_client, main_module, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "boss@example.com")

    def profiles_chain(_name):
        if _name != "profiles":
            return MagicMock()
        m = MagicMock()
        m.select.return_value = m
        m.eq.return_value = m
        m.limit.return_value = m
        m.execute.return_value = SimpleNamespace(data=[{"email": "user@other.com"}])
        return m

    supa = MagicMock()
    supa.table.side_effect = profiles_chain
    main_module.supabase = supa

    r = authed_client.get("/api/admin/users")
    assert r.status_code == 403


def test_food_search_requires_auth(main_module):
    client = TestClient(main_module.app)
    r = client.get("/api/food/search?query=milk")
    assert r.status_code == 401


def test_food_search_query_too_long(authed_client, main_module, monkeypatch):
    monkeypatch.setattr(main_module, "USDA_API_KEY", "dummy-key-for-test")
    q = "x" * 201
    r = authed_client.get(f"/api/food/search?query={q}")
    assert r.status_code == 400
