import importlib
import os
import sys
import types
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


def _install_slowapi_stub() -> None:
    if "slowapi" in sys.modules:
        return

    slowapi_module = types.ModuleType("slowapi")
    util_module = types.ModuleType("slowapi.util")
    errors_module = types.ModuleType("slowapi.errors")

    class _RateLimitExceeded(Exception):
        pass

    class _Limiter:
        def __init__(self, key_func=None):
            self.key_func = key_func

        def limit(self, _rule: str):
            def _decorator(func):
                return func

            return _decorator

    def _get_remote_address(_request):
        return "127.0.0.1"

    async def _rate_limit_exceeded_handler(_request, _exc):
        return None

    slowapi_module.Limiter = _Limiter
    slowapi_module._rate_limit_exceeded_handler = _rate_limit_exceeded_handler
    util_module.get_remote_address = _get_remote_address
    errors_module.RateLimitExceeded = _RateLimitExceeded

    sys.modules["slowapi"] = slowapi_module
    sys.modules["slowapi.util"] = util_module
    sys.modules["slowapi.errors"] = errors_module


@pytest.fixture(scope="session")
def main_module():
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
    os.environ.setdefault("NODE_ENV", "test")

    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "test-user"}]
    )

    _install_slowapi_stub()

    with patch("supabase.create_client", return_value=mock_supabase):
        module = importlib.import_module("main")
    return module
