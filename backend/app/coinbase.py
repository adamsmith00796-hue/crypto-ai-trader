"""Read-only Coinbase balances via the Advanced Trade API.

Needs a key created with *View only* permission. Credentials come from
backend/.env: COINBASE_API_KEY_NAME and COINBASE_API_PRIVATE_KEY.
Requests are signed with a short-lived JWT (Ed25519), built by hand so we
only need the `cryptography` package.
"""

from __future__ import annotations

import base64
import json
import secrets
import time
from typing import Any

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .coinspot import _load_env

HOST = "api.coinbase.com"
ACCOUNTS_PATH = "/api/v3/brokerage/accounts"

# Coinbase ticker -> the ticker used elsewhere (CoinMarketCap, your config).
SYMBOL_ALIASES = {"LIGHTER": "LIT"}

_cache: tuple[float, dict[str, Any]] | None = None
_TTL = 60


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _load_key(raw: str) -> Ed25519PrivateKey:
    # CDP Ed25519 secrets are base64 of 64 bytes (32-byte seed + public key).
    data = base64.b64decode(raw.strip().replace("\\n", "").replace("\n", ""))
    if len(data) not in (32, 64):
        raise ValueError("unexpected key length")
    return Ed25519PrivateKey.from_private_bytes(data[:32])


def _jwt(key_name: str, key: Ed25519PrivateKey, method: str, path: str) -> str:
    now = int(time.time())
    header = {"alg": "EdDSA", "typ": "JWT", "kid": key_name, "nonce": secrets.token_hex(8)}
    payload = {
        "sub": key_name,
        "iss": "cdp",
        "nbf": now,
        "exp": now + 120,
        "uri": f"{method} {HOST}{path}",
    }
    signing_input = _b64url(json.dumps(header, separators=(",", ":")).encode()) + "." + _b64url(
        json.dumps(payload, separators=(",", ":")).encode()
    )
    return signing_input + "." + _b64url(key.sign(signing_input.encode()))


async def get_coinbase() -> dict[str, Any]:
    """Return {"connected", "error", "holdings"}. Never raises."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < _TTL:
        return _cache[1]

    env = _load_env()
    name, raw = env.get("COINBASE_API_KEY_NAME"), env.get("COINBASE_API_PRIVATE_KEY")
    if not name or not raw:
        return {"connected": False, "error": "no credentials", "holdings": []}

    try:
        key = _load_key(raw)
    except Exception:
        return {"connected": False, "error": "private key not readable (expected Ed25519 base64)", "holdings": []}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            accounts: list[dict] = []
            cursor = ""
            for _ in range(10):  # paginate, but cap it
                resp = await client.get(
                    f"https://{HOST}{ACCOUNTS_PATH}",
                    params={"limit": 250, **({"cursor": cursor} if cursor else {})},
                    headers={"Authorization": "Bearer " + _jwt(name, key, "GET", ACCOUNTS_PATH)},
                )
                resp.raise_for_status()
                page = resp.json()
                accounts += page.get("accounts", [])
                if not page.get("has_next"):
                    break
                cursor = page.get("cursor", "")

            holdings = []
            for a in accounts:
                qty = float(a.get("available_balance", {}).get("value") or 0) + float(
                    a.get("hold", {}).get("value") or 0
                )
                if qty <= 0:
                    continue
                sym = a["currency"].upper()
                price_sym = sym  # Coinbase price lookup uses its own ticker
                sym = SYMBOL_ALIASES.get(sym, sym)
                price = 1.0
                if sym != "USD":
                    try:
                        p = await client.get(f"https://{HOST}/v2/prices/{price_sym}-USD/spot", timeout=10)
                        p.raise_for_status()
                        price = float(p.json()["data"]["amount"])
                    except (httpx.HTTPError, KeyError, ValueError):
                        price = 0.0
                holdings.append(
                    {
                        "label": "Coinbase",
                        "source": "exchange:coinbase",
                        "symbol": sym,
                        "quantity": qty,
                        "price": price,
                        "value": round(qty * price, 2),
                    }
                )
    except httpx.HTTPStatusError as e:
        if _cache:
            return _cache[1]
        return {"connected": False, "error": f"Coinbase said {e.response.status_code}", "holdings": []}
    except (httpx.HTTPError, ValueError, KeyError) as e:
        if _cache:
            return _cache[1]
        return {"connected": False, "error": f"request failed: {type(e).__name__}", "holdings": []}

    result = {"connected": True, "error": None, "holdings": holdings}
    _cache = (now, result)
    return result
