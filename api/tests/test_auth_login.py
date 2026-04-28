"""Tests for /auth/login happy and sad paths."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

USER_ID = "44444444-4444-4444-4444-444444444444"
EMAIL = "user@example.com"
PASSWORD = "secret123"
TOKEN = "jwt-token-abc"


def test_auth_login_happy(main_module):
    auth_response = SimpleNamespace(
        user=SimpleNamespace(id=USER_ID),
        session=SimpleNamespace(access_token=TOKEN),
    )

    supa = MagicMock()
    supa.auth.sign_in_with_password.return_value = auth_response

    profiles = MagicMock()
    profiles.select.return_value = profiles
    profiles.eq.return_value = profiles
    profiles.execute.return_value = SimpleNamespace(data=[{"id": USER_ID, "name": "Test User", "email": EMAIL}])
    supa.table.return_value = profiles

    main_module.supabase = supa
    client = TestClient(main_module.app)

    r = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["token"] == TOKEN
    assert body["user"]["id"] == USER_ID
    assert body["user"]["email"] == EMAIL
    assert body["user"]["name"] == "Test User"


def test_auth_login_sad_invalid_credentials(main_module):
    supa = MagicMock()
    supa.auth.sign_in_with_password.side_effect = Exception("Invalid login credentials")
    main_module.supabase = supa

    client = TestClient(main_module.app)
    r = client.post("/auth/login", json={"email": EMAIL, "password": "wrong-pass"})
    assert r.status_code == 401
    assert "Invalid email or password" in r.json().get("detail", "")
