# API Unit Test Coverage

This document explains what is currently covered by unit tests in `api/tests`.

## Test setup and strategy

- Tests run with `pytest` using `api/pytest.ini`.
- `api/tests/conftest.py` sets minimal test environment variables and patches `supabase.create_client`.
- `conftest.py` also provides a lightweight `slowapi` stub in test environments where that dependency is not installed, so importing `src/main.py` remains deterministic.
- Most tests focus on pure or near-pure helper logic to avoid network/database dependency.

## What is being tested

## `test_validation.py`

- Checks that good emails are accepted.
- Checks that bad emails are rejected.
- Checks that good US phone numbers are accepted (even if formatted like `+1 (234) 567-8901`).
- Checks that bad phone numbers are rejected (wrong length or invalid digits in key positions).
- Checks notification contact rules:
  - valid email/SMS contact is allowed,
  - invalid contact or unsupported channel throws an error.

## `test_storage_helpers.py`

- Checks that food categories map to the right place to store them (`pantry`, `fridge`, or `freezer`).
- Checks that unknown categories return no recommendation.
- Checks the storage safety ranking (`freezer` safest, then `fridge`, then `pantry`).
- Checks whether one storage choice is less safe than another.

## `test_suggest_expiration.py`

- Checks expiration suggestion for a known fridge item (`whole milk`).
- Checks expiration suggestion for a known pantry item (`white rice`).
- Checks default behavior for unknown items (fallback date and low confidence).
- Checks that opening an item changes the suggested shelf life when expected (`basmati rice` case).

## `test_apify_normalize.py`

- Checks that price parsing works across different response shapes.
- Checks that items from Apify are converted into one consistent internal format.
- Checks that wrapped payload formats are handled correctly.
- Checks that rows without a usable price are skipped.

## Running tests

From `api/`:

```bash
python -m pytest
```

