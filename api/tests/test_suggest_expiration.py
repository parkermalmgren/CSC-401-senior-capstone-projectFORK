from datetime import date, timedelta


def test_suggest_expiration_known_dairy_item(main_module):
    purchased = date(2026, 1, 15)
    suggested_date, confidence, category, recommended_storage = main_module.suggest_expiration_date(
        item_name="whole milk",
        storage_type="fridge",
        purchased_date=purchased,
        is_opened=False,
    )

    assert suggested_date == purchased + timedelta(days=7)
    assert confidence == "high"
    assert category == "dairy"
    assert recommended_storage == "fridge"


def test_suggest_expiration_known_dry_item(main_module):
    purchased = date(2026, 1, 15)
    suggested_date, confidence, category, recommended_storage = main_module.suggest_expiration_date(
        item_name="white rice",
        storage_type="pantry",
        purchased_date=purchased,
        is_opened=False,
    )

    assert suggested_date == purchased + timedelta(days=730)
    assert confidence == "high"
    assert category == "dry"
    assert recommended_storage == "pantry"


def test_suggest_expiration_unknown_item_defaults(main_module):
    purchased = date(2026, 1, 15)
    suggested_date, confidence, category, recommended_storage = main_module.suggest_expiration_date(
        item_name="mystery meal cube",
        storage_type="pantry",
        purchased_date=purchased,
        is_opened=False,
    )

    assert suggested_date == purchased + timedelta(days=7)
    assert confidence == "low"
    assert category is None
    assert recommended_storage is None


def test_suggest_expiration_opened_item_adjusts_days(main_module):
    purchased = date(2026, 1, 15)
    suggested_date, confidence, category, recommended_storage = main_module.suggest_expiration_date(
        item_name="basmati rice",
        storage_type="pantry",
        purchased_date=purchased,
        is_opened=True,
    )

    assert suggested_date == purchased + timedelta(days=693)
    assert confidence == "high"
    assert category == "dry"
    assert recommended_storage == "pantry"
