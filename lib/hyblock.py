"""
Hyblock Capital API client for mathijs-os v2.

Usage:
    from lib.hyblock import HB
    hb = HB()
    data = hb.get("anchoredCVD", coin="btc", exchange="binance_spot", tf="1h", limit=1000)
    # data = [{"openDate": ..., "cumulativeDelta": ...}, ...]
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
import urllib.parse

_TOKEN_CACHE: dict = {"token": None, "expires": 0}


def _env(key: str) -> str:
    val = os.environ.get(key, "")
    if not val:
        raise RuntimeError(f"Missing env var: {key}")
    return val


class HB:
    """Hyblock Capital API v2 client. Zero dependencies."""

    BASE = "https://api.hyblockcapital.com"

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        api_key: str | None = None,
    ):
        self.client_id = client_id or _env("HB_CLIENT_ID")
        self.client_secret = client_secret or _env("HB_CLIENT_SECRET")
        self.api_key = api_key or _env("HB_API_KEY")

    # --- public API ---

    def get(
        self,
        endpoint: str,
        coin: str = "btc",
        exchange: str = "binance_perp_stable",
        tf: str = "1h",
        limit: int = 1000,
        **extra,
    ) -> list[dict]:
        """
        GET /v2/{endpoint} with standard params.
        Returns data[] array directly.
        """
        params = {
            "coin": coin.lower(),
            "exchange": exchange,
            "timeframe": tf,
            "limit": limit,
            **extra,
        }
        resp = self._request(f"/v2/{endpoint}", params)
        return resp.get("data", resp if isinstance(resp, list) else [])

    def klines(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        """Shortcut for price data."""
        return self.get("klines", coin=coin, tf=tf, limit=limit)

    def cvd_spot(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        return self.get("anchoredCVD", coin=coin, exchange="binance_spot", tf=tf, limit=limit)

    def cvd_perp(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        return self.get("anchoredCVD", coin=coin, exchange="binance_perp_stable", tf=tf, limit=limit)

    def funding(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        return self.get("fundingRate", coin=coin, tf=tf, limit=limit)

    def retail(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        return self.get("trueRetailLongShort", coin=coin, tf=tf, limit=limit)

    def bid_ask(self, coin: str = "btc", exchange: str = "binance_spot", tf: str = "1h", limit: int = 1000, depth: int = 10) -> list[dict]:
        return self.get("bidAskRatio", coin=coin, exchange=exchange, tf=tf, limit=limit, depth=depth)

    def oi(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        return self.get("openInterest", coin=coin, tf=tf, limit=limit)

    def liquidations(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        return self.get("liquidation", coin=coin, tf=tf, limit=limit)

    def whale_retail(self, coin: str = "btc", tf: str = "1h", limit: int = 1000) -> list[dict]:
        return self.get("whaleRetailDelta", coin=coin, tf=tf, limit=limit)

    # --- auth ---

    def _get_token(self) -> str:
        now = time.time()
        if _TOKEN_CACHE["token"] and _TOKEN_CACHE["expires"] > now:
            return _TOKEN_CACHE["token"]

        data = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }).encode()

        req = urllib.request.Request(
            f"{self.BASE}/oauth2/token",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())

        token = result["access_token"]
        # Cache for 23 hours (token is 24h TTL)
        _TOKEN_CACHE["token"] = token
        _TOKEN_CACHE["expires"] = now + 82800
        return token

    def _request(self, path: str, params: dict) -> dict:
        token = self._get_token()
        qs = urllib.parse.urlencode(params)
        url = f"{self.BASE}{path}?{qs}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "x-api-key": self.api_key,
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
