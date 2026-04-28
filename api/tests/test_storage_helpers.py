import pytest


@pytest.mark.parametrize(
    "category,expected",
    [
        ("dairy", "fridge"),
        ("frozen", "freezer"),
        ("dry", "pantry"),
        ("unknown-category", None),
        (None, None),
    ],
)
def test_get_recommended_storage_type(main_module, category, expected):
    assert main_module.get_recommended_storage_type(category) == expected


def test_get_storage_safety_level(main_module):
    assert main_module.get_storage_safety_level("pantry") == 1
    assert main_module.get_storage_safety_level("fridge") == 2
    assert main_module.get_storage_safety_level("freezer") == 3
    assert main_module.get_storage_safety_level("not-real") == 1


def test_is_less_safe_storage(main_module):
    assert main_module.is_less_safe_storage("pantry", "fridge")
    assert main_module.is_less_safe_storage("fridge", "freezer")
    assert not main_module.is_less_safe_storage("freezer", "fridge")
    assert not main_module.is_less_safe_storage("fridge", "fridge")
