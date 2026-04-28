"""Validation tests for recipes and price-compare endpoints."""

import pytest
from fastapi.testclient import TestClient

USER_ID = "55555555-5555-5555-5555-555555555555"


@pytest.fixture
def authed_client(main_module):
    def override_get_user_id():
        return USER_ID

    main_module.app.dependency_overrides[main_module.get_user_id] = override_get_user_id
    client = TestClient(main_module.app)
    yield client
    main_module.app.dependency_overrides.clear()


def test_recipes_by_ingredients_rejects_overlong_input(authed_client, main_module, monkeypatch):
    monkeypatch.setattr(main_module, "SPOONACULAR_API_KEY", "dummy-spoon-key")
    long_ingredients = "a" * 201

    r = authed_client.get("/api/recipes/by-ingredients", params={"ingredients": long_ingredients})
    assert r.status_code == 400
    assert "at most 200 characters" in r.json().get("detail", "")


def test_price_compare_rejects_invalid_zip(main_module):
    # Validation happens before downstream Apify service calls.
    client = TestClient(main_module.app)
    r = client.get("/api/price-compare", params={"query": "milk", "zip": "12A45"})
    assert r.status_code == 400
    assert "5-digit US ZIP code" in r.json().get("detail", "")
