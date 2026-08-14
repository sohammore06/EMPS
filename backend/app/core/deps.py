from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import Role, User, UserRole

security_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    def __init__(self, user: User, roles: list[str]):
        self.user = user
        self.roles = roles
        self.id = user.id
        self.email = user.email

    def has_role(self, *roles: str) -> bool:
        return any(r in self.roles for r in roles)

    @property
    def is_hr(self) -> bool:
        return self.has_role("HR", "SUPERADMIN")

    @property
    def is_manager(self) -> bool:
        return self.has_role("MANAGER", "HR", "SUPERADMIN")


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user = (
        db.query(User)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
        .filter(User.id == user_id, User.is_deleted == False)  # noqa: E712
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    roles = [ur.role.name for ur in user.user_roles if ur.role]
    return CurrentUser(user=user, roles=roles)


def require_roles(*allowed: str):
    async def checker(current: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if "SUPERADMIN" in current.roles:
            return current
        if not any(r in current.roles for r in allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(allowed)}",
            )
        return current

    return checker
