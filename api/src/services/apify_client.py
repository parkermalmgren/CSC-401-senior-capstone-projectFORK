"""
Apify client for hybrid grocery price source (Instacart scraper Actor).

- Usage guard: stop using Apify when monthly usage >= threshold or credits too low.
- Caching: in-memory cache by (query, zip_code) to avoid burning credits.
- Never calls Apify when can_use_apify() returns False.
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Configuration (from environment; do not log token)
# -----------------------------------------------------------------------------
APIFY_BASE = "https://api.apify.com"
APIFY_TOKEN = os.getenv("APIFY_TOKEN", "").strip()
# Apify API v2 expects actorId as "username~actor-name" (tilde); store URLs use slash, so we normalize
APIFY_ACTOR_ID = os.getenv("APIFY_ACTOR_ID", "consummate_mandala~instacart-product-scraper").strip().replace("/", "~")
USAGE_CUTOFF_USD = float(os.getenv("USAGE_CUTOFF_USD", "4.50"))
USAGE_REMAINING_MIN_USD = 0.50
USAGE_CACHE_SECONDS = 10 * 60  # 10 minutes
# When residential proxy is on, runs are slower; use longer default if not set
_default_timeout = "240" if os.getenv("APIFY_USE_RESIDENTIAL_PROXY", "").strip().lower() in ("1", "true", "yes") else "120"
APIFY_TIMEOUT_SECONDS = int(os.getenv("APIFY_TIMEOUT_SECONDS", _default_timeout))
CACHE_TTL_HOURS = float(os.getenv("APIFY_CACHE_TTL_HOURS", "6"))
# Residential proxy often improves success when Instacart blocks; uses more Apify usage
_use_proxy_raw = os.getenv("APIFY_USE_RESIDENTIAL_PROXY", "").strip().lower()
APIFY_USE_RESIDENTIAL_PROXY = _use_proxy_raw in ("1", "true", "yes")

def _headers() -> Dict[str, str]:
    """Request headers with Bearer token. Never log token."""
    return {
        "Authorization": f"Bearer {APIFY_TOKEN}",
        "Content-Type": "application/json",
    }


# -----------------------------------------------------------------------------
# Usage guard: cache and can_use_apify
# -----------------------------------------------------------------------------
_usage_cache: Optional[Tuple[float, Dict[str, Any]]] = None  # (cached_at, response)


def get_monthly_usage_cached() -> Optional[Dict[str, Any]]:
    """
    Fetch monthly usage from Apify. Cached for 10 minutes.
    Uses GET /v2/users/me/usage/monthly with Bearer token (not in URL).
    Returns None on any error (network, non-200, JSON).
    """
    global _usage_cache
    now = time.time()
    if _usage_cache is not None:
        cached_at, data = _usage_cache
        if now - cached_at < USAGE_CACHE_SECONDS:
            return data
    if not APIFY_TOKEN:
        logger.warning("Apify: no APIFY_TOKEN set")
        return None
    url = f"{APIFY_BASE}/v2/users/me/usage/monthly"
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, headers=_headers())
        if resp.status_code != 200:
            logger.warning("Apify usage API returned status %s", resp.status_code)
            return None
        data = resp.json()
        _usage_cache = (now, data)
        return data
    except httpx.TimeoutException:
        logger.warning("Apify usage API timeout")
        return None
    except httpx.RequestError as e:
        logger.warning("Apify usage API request error: %s", type(e).__name__)
        return None
    except Exception as e:
        logger.warning("Apify usage API error: %s", type(e).__name__)
        return None


def can_use_apify() -> Tuple[bool, str]:
    """
    Returns (allowed: bool, reason: str).
    Disables Apify when:
    - currentMonthUsageUsd >= USAGE_CUTOFF_USD (default 4.50), or
    - remainingCreditsUsd <= 0.50 (or missing).
    Uses cached usage for 10 minutes.
    """
    if not APIFY_TOKEN:
        return False, "APIFY_TOKEN not configured"
    usage = get_monthly_usage_cached()
    if usage is None:
        # On failure to fetch usage, be safe: do not allow runs
        return False, "Could not verify monthly usage; Apify disabled for safety"
    data = usage.get("data") or usage
    current_usd = None
    remaining_usd = None
    try:
        # Apify may use currentMonthUsageUsd or totalUsageCreditsUsdAfterVolumeDiscount
        current_usd = data.get("currentMonthUsageUsd") or data.get("totalUsageCreditsUsdAfterVolumeDiscount")
        remaining_usd = data.get("remainingCreditsUsd")
        if current_usd is not None:
            cu = float(current_usd)
            if cu >= USAGE_CUTOFF_USD:
                return False, f"Monthly usage limit reached (${cu:.2f} >= ${USAGE_CUTOFF_USD})"
        if remaining_usd is not None:
            ru = float(remaining_usd)
            if ru <= USAGE_REMAINING_MIN_USD:
                return False, f"Remaining credits too low (${ru:.2f})"
    except (TypeError, ValueError) as e:
        logger.warning("Apify usage parse error: %s", e)
        return False, "Invalid usage response; Apify disabled for safety"
    return True, "OK"


# -----------------------------------------------------------------------------
# In-memory result cache (query, zip_code) -> (expires_at, normalized_results)
# -----------------------------------------------------------------------------
_result_cache: Dict[Tuple[str, str], Tuple[float, List[Dict[str, Any]]]] = {}
_cache_ttl_seconds = CACHE_TTL_HOURS * 3600


def _cache_key(query: str, zip_code: str) -> Tuple[str, str]:
    return (query.strip().lower(), zip_code.strip())


def _get_cached(query: str, zip_code: str) -> Optional[List[Dict[str, Any]]]:
    key = _cache_key(query, zip_code)
    if key not in _result_cache:
        return None
    expires_at, results = _result_cache[key]
    if time.time() > expires_at:
        del _result_cache[key]
        return None
    return results


def _set_cached(query: str, zip_code: str, results: List[Dict[str, Any]]) -> None:
    key = _cache_key(query, zip_code)
    _result_cache[key] = (time.time() + _cache_ttl_seconds, results)


# -----------------------------------------------------------------------------
# Normalize Actor output to internal schema
# -----------------------------------------------------------------------------
def _get_price(row: Dict[str, Any]) -> Optional[float]:
    """Extract numeric price from row; try common keys and nested pricing."""
    for key in ("price", "currentPrice", "unitPrice", "salePrice", "amount", "value"):
        v = row.get(key)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    # Nested e.g. pricing.price
    for nest in ("pricing", "priceInfo", "price_info"):
        obj = row.get(nest)
        if isinstance(obj, dict):
            p = obj.get("price") or obj.get("currentPrice") or obj.get("amount")
            if p is not None:
                try:
                    return float(p)
                except (TypeError, ValueError):
                    pass
    return None


def normalize_items(raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Normalize raw Actor/dataset items to internal schema:
    source, store, name, price, unit_price, size, url, retrieved_at.
    Handles multiple field names and logs when nothing matches.
    """
    retrieved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    out = []
    items = raw_items or []
    # Unwrap if API returned { "items": [...] } or { "results": [...] }
    if len(items) == 1 and isinstance(items[0], dict) and ("items" in items[0] or "results" in items[0]):
        items = items[0].get("items") or items[0].get("results") or items
    for row in items:
        if not isinstance(row, dict):
            continue
        # Some actors wrap the product in .product or .item
        row = row.get("product") or row.get("item") or row
        if not isinstance(row, dict):
            continue
        try:
            price = _get_price(row)
            if price is None:
                continue
            name = (
                row.get("name")
                or row.get("title")
                or row.get("productName")
                or row.get("itemName")
                or row.get("label")
                or row.get("searchTerm")
                or ""
            )
            if isinstance(name, str):
                name = name.strip() or "Unknown"
            else:
                name = "Unknown"
            store = (row.get("store") or row.get("retailer") or row.get("storeName") or "Instacart").strip()
            unit_price = row.get("unitPrice") or row.get("pricePerUnit") or row.get("price_per_unit")
            if unit_price is not None:
                try:
                    unit_price = float(unit_price)
                except (TypeError, ValueError):
                    unit_price = None
            size = row.get("size") or row.get("quantity") or row.get("packageSize")
            if size is not None and not isinstance(size, str):
                size = str(size)
            url = row.get("url") or row.get("link") or row.get("productUrl")
            if url is not None and not isinstance(url, str):
                url = str(url)
            out.append({
                "source": "apify",
                "store": store,
                "name": name,
                "price": price,
                "unit_price": unit_price,
                "size": size,
                "url": url,
                "retrieved_at": retrieved_at,
            })
        except Exception as e:
            logger.debug("Skip item normalize: %s", e)
            continue
    if items and not out:
        first = items[0] if isinstance(items[0], dict) else {}
        logger.info(
            "Apify dataset had %s items but none matched price/name; first item keys: %s",
            len(items),
            list(first.keys()) if first else "n/a",
        )
    return out


# -----------------------------------------------------------------------------
# ApifyClient: run Actor, poll, fetch dataset
# -----------------------------------------------------------------------------
class ApifyClient:
    """Client to run Apify Instacart scraper Actor with usage guard and caching."""

    def __init__(
        self,
        token: Optional[str] = None,
        actor_id: Optional[str] = None,
        timeout_seconds: int = APIFY_TIMEOUT_SECONDS,
    ):
        self.token = (token or APIFY_TOKEN).strip()
        raw = (actor_id or APIFY_ACTOR_ID).strip()
        self.actor_id = raw.replace("/", "~")  # API v2 uses tilde, not slash
        self.timeout_seconds = timeout_seconds

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def run_actor_search(self, query: str, zip_code: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """
        Start Actor run with search term + zip, poll until finished (or timeout),
        fetch default dataset items, normalize and return.
        Returns (normalized_items, error_reason). On success error_reason is None.
        On FAILED/ABORTED/TIMED-OUT or any exception, returns ([], reason).
        """
        if not self.token:
            return [], "APIFY_TOKEN not set"
        # Actor input: consummate_mandala/instacart-product-scraper uses searchTerms (array); lower maxResults = faster run
        max_results = int(os.getenv("APIFY_MAX_RESULTS", "10"))
        actor_input = {
            "searchTerms": [query.strip()],
            "maxResults": max(1, min(max_results, 100)),
            "zipCode": str(zip_code).strip(),
            "useResidentialProxy": APIFY_USE_RESIDENTIAL_PROXY,
        }
        run_url = f"{APIFY_BASE}/v2/acts/{self.actor_id}/runs"
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(run_url, headers=self._headers(), json=actor_input)
            if resp.status_code != 201:
                logger.warning("Apify start run returned %s", resp.status_code)
                return [], f"Actor start failed (HTTP {resp.status_code})"
            run_data = resp.json()
        except httpx.TimeoutException:
            return [], "Request to start Actor timed out"
        except httpx.RequestError as e:
            logger.warning("Apify start run request error: %s", type(e).__name__)
            return [], "Network error starting Actor"
        except Exception as e:
            logger.warning("Apify start run error: %s", type(e).__name__)
            return [], "Failed to start Actor"

        run_id = run_data.get("data", {}).get("id")
        if not run_id:
            return [], "Invalid run response (no run id)"

        # Poll until SUCCEEDED (terminal success); READY/RUNNING are transitional (Apify: READY = just started, SUCCEEDED = finished)
        poll_url = f"{APIFY_BASE}/v2/actor-runs/{run_id}"
        deadline = time.time() + self.timeout_seconds
        sleep_sec = 1.0
        while time.time() < deadline:
            try:
                with httpx.Client(timeout=15.0) as client:
                    poll_resp = client.get(poll_url, headers=self._headers())
                if poll_resp.status_code != 200:
                    return [], f"Run status check failed (HTTP {poll_resp.status_code})"
                poll_data = poll_resp.json()
                status = (poll_data.get("data") or {}).get("status", "").upper()
            except (httpx.RequestError, Exception) as e:
                logger.warning("Apify poll error: %s", type(e).__name__)
                return [], "Run status check failed"
            if status == "SUCCEEDED":
                default_dataset_id = (poll_data.get("data") or {}).get("defaultDatasetId")
                if not default_dataset_id:
                    return [], "Run finished but no dataset id"
                # Fetch dataset items
                ds_url = f"{APIFY_BASE}/v2/datasets/{default_dataset_id}/items"
                try:
                    with httpx.Client(timeout=20.0) as client:
                        ds_resp = client.get(ds_url, headers=self._headers())
                    if ds_resp.status_code != 200:
                        return [], f"Dataset fetch failed (HTTP {ds_resp.status_code})"
                    raw_items = ds_resp.json()
                except httpx.TimeoutException:
                    return [], "Dataset fetch timed out"
                except Exception as e:
                    logger.warning("Dataset fetch error: %s", type(e).__name__)
                    return [], "Dataset fetch failed"
                if not isinstance(raw_items, list):
                    raw_items = [raw_items] if raw_items else []
                normalized = normalize_items(raw_items)
                if not normalized and raw_items:
                    # Actor returned only status/fallback records (e.g. _fallback, message, scrapedAt), no real products
                    first = raw_items[0] if isinstance(raw_items[0], dict) else {}
                    msg = first.get("message") or first.get("_fallback")
                    if isinstance(msg, str) and msg.strip():
                        reason = msg.strip()[:300] + ("..." if len(msg.strip()) > 300 else "")
                    else:
                        reason = "No products in results (Instacart may have returned no listings or a block/captcha)."
                    return [], reason
                return normalized, None
            if status in ("FAILED", "ABORTED", "TIMED-OUT", "TIMED-OUT "):
                return [], f"Actor run {status}"
            time.sleep(sleep_sec)
            sleep_sec = min(sleep_sec * 2, 8.0)
        return [], "Actor run timed out (polling)"


def cached_search(query: str, zip_code: str) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
    """
    Search for grocery prices: check cache first, then (if allowed) run Apify.
    Returns (normalized_results, used_cache, error_reason).
    Never calls Apify when can_use_apify() is False.
    """
    query = (query or "").strip()
    zip_code = (zip_code or "").strip()
    if not query or not zip_code:
        return [], False, "query and zip are required"

    # 1) Check cache
    cached = _get_cached(query, zip_code)
    if cached is not None:
        logger.info("Apify cache hit for query=%s zip=%s", query[:50], zip_code)
        return cached, True, None

    # 2) Usage guard
    allowed, reason = can_use_apify()
    if not allowed:
        return [], False, reason

    # 3) Run Actor
    client = ApifyClient()
    results, err = client.run_actor_search(query, zip_code)
    if err:
        return [], False, err
    _set_cached(query, zip_code, results)
    return results, False, None
