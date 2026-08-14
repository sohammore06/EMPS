from functools import lru_cache
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient

from app.core.config import get_settings

settings = get_settings()


@lru_cache
def _get_jwks_client() -> PyJWKClient:
    return PyJWKClient(settings.azure_jwks_uri)


def validate_microsoft_id_token(id_token: str) -> dict[str, Any]:
    """Validate a Microsoft Entra ID token and return claims."""
    if not settings.AZURE_CLIENT_ID or not settings.AZURE_TENANT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure AD is not configured",
        )

    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)

        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.AZURE_CLIENT_ID,
            options={"verify_iss": False},
        )

        # Accept both v1 and v2 issuer formats
        iss = claims.get("iss", "")
        valid_issuers = [
            f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/v2.0",
            f"https://sts.windows.net/{settings.AZURE_TENANT_ID}/",
            f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/",
        ]
        if iss.rstrip("/") not in [i.rstrip("/") for i in valid_issuers] and settings.AZURE_TENANT_ID not in iss:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token issuer")

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Microsoft token: {exc}",
        ) from exc

    email = (
        claims.get("preferred_username")
        or claims.get("email")
        or claims.get("upn")
        or claims.get("unique_name")
    )
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Microsoft token missing email claim",
        )

    return {
        "oid": claims.get("oid") or claims.get("sub"),
        "email": email.lower().strip(),
        "name": claims.get("name"),
        "given_name": claims.get("given_name"),
        "family_name": claims.get("family_name"),
        "raw": claims,
    }


async def get_microsoft_user_photo(access_token: str) -> bytes | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me/photo/$value",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code == 200:
            return resp.content
    return None
