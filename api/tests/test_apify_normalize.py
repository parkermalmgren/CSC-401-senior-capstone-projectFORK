from services import apify_client


def test_get_price_supports_top_level_and_nested_fields():
    assert apify_client._get_price({"price": "3.99"}) == 3.99
    assert apify_client._get_price({"currentPrice": 4.5}) == 4.5
    assert apify_client._get_price({"pricing": {"price": "5.25"}}) == 5.25
    assert apify_client._get_price({"priceInfo": {"amount": "6.10"}}) == 6.10
    assert apify_client._get_price({"name": "No Price"}) is None


def test_normalize_items_maps_common_fields():
    raw_items = [
        {
            "name": "Gala Apple",
            "price": "1.99",
            "store": "Local Market",
            "unitPrice": "0.50",
            "size": "1 lb",
            "url": "https://example.com/apple",
        }
    ]

    normalized = apify_client.normalize_items(raw_items)

    assert len(normalized) == 1
    item = normalized[0]
    assert item["source"] == "apify"
    assert item["name"] == "Gala Apple"
    assert item["store"] == "Local Market"
    assert item["price"] == 1.99
    assert item["unit_price"] == 0.5
    assert item["size"] == "1 lb"
    assert item["url"] == "https://example.com/apple"
    assert item["retrieved_at"].endswith("Z")


def test_normalize_items_unwraps_and_handles_product_wrapper():
    raw_items = [
        {
            "items": [
                {
                    "product": {
                        "title": "Whole Milk",
                        "pricing": {"price": "4.49"},
                        "retailer": "Instacart",
                        "packageSize": "1 gal",
                        "productUrl": "https://example.com/milk",
                    }
                }
            ]
        }
    ]

    normalized = apify_client.normalize_items(raw_items)
    assert len(normalized) == 1
    item = normalized[0]
    assert item["name"] == "Whole Milk"
    assert item["price"] == 4.49
    assert item["store"] == "Instacart"
    assert item["size"] == "1 gal"
    assert item["url"] == "https://example.com/milk"


def test_normalize_items_skips_rows_without_price():
    raw_items = [{"name": "No Price"}, {"itemName": "Has Price", "amount": "2.00"}]
    normalized = apify_client.normalize_items(raw_items)

    assert len(normalized) == 1
    assert normalized[0]["name"] == "Has Price"
    assert normalized[0]["price"] == 2.0
