from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.core.microsoft_auth import validate_microsoft_id_token
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    store_refresh_token,
    verify_password,
)
from app.models.auth import RefreshToken
from app.models.user import User, UserRole
from app.schemas import (
    AuthUser,
    LocalLoginRequest,
    MessageOut,
    MicrosoftLoginRequest,
    RefreshRequest,
    TokenResponse,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_auth_user(user: User, roles: list[str]) -> AuthUser:
    return AuthUser(
        id=user.id,
        name=user.full_name,
        email=user.email,
        roles=roles,
        employee_code=user.employee_code,
        department=user.department.name if user.department else None,
        designation=user.designation.name if user.designation else None,
    )


def _issue_tokens(db: Session, user: User, roles: list[str]) -> TokenResponse:
    access = create_access_token(user.id, extra={"roles": roles, "email": user.email})
    refresh = create_refresh_token(user.id)
    store_refresh_token(db, user.id, refresh)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=_build_auth_user(user, roles),
    )


@router.post("/microsoft", response_model=TokenResponse)
def microsoft_login(body: MicrosoftLoginRequest, db: Annotated[Session, Depends(get_db)]):
    claims = validate_microsoft_id_token(body.id_token)
    email = claims["email"]

    user = (
        db.query(User)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
        .filter(User.email == email, User.is_deleted == False)  # noqa: E712
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee not registered in EPMS",
        )

    if not user.microsoft_oid and claims.get("oid"):
        user.microsoft_oid = claims["oid"]
    user.is_microsoft_account = True
    user.last_login_at = datetime.utcnow()
    db.commit()

    roles = [ur.role.name for ur in user.user_roles if ur.role]
    if not roles:
        roles = ["EMPLOYEE"]

    log_audit(db, user_id=user.id, action="LOGIN", entity="User", entity_id=user.id, new_values={"method": "microsoft"})
    db.commit()
    return _issue_tokens(db, user, roles)


@router.post("/login", response_model=TokenResponse)
def local_login(body: LocalLoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = (
        db.query(User)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
        .filter(User.email == body.email.lower().strip(), User.is_deleted == False)  # noqa: E712
        .first()
    )
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    user.last_login_at = datetime.utcnow()
    db.commit()

    roles = [ur.role.name for ur in user.user_roles if ur.role]
    if not roles:
        roles = ["EMPLOYEE"]

    log_audit(db, user_id=user.id, action="LOGIN", entity="User", entity_id=user.id, new_values={"method": "local"})
    db.commit()
    return _issue_tokens(db, user, roles)


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(body: RefreshRequest, db: Annotated[Session, Depends(get_db)]):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        user_id = payload.get("sub")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    stored = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token == body.refresh_token,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked != True,  # noqa: E712
        )
        .first()
    )
    if not stored or stored.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired or revoked")

    user = (
        db.query(User)
        .options(joinedload(User.user_roles).joinedload(UserRole.role))
        .filter(User.id == user_id, User.is_deleted == False)  # noqa: E712
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    stored.revoked = True
    db.commit()

    roles = [ur.role.name for ur in user.user_roles if ur.role]
    return _issue_tokens(db, user, roles)


@router.get("/me", response_model=AuthUser)
def auth_me(current: Annotated[CurrentUser, Depends(get_current_user)]):
    return _build_auth_user(current.user, current.roles)


@router.post("/logout", response_model=MessageOut)
def logout(
    body: RefreshRequest,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    stored = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == body.refresh_token, RefreshToken.user_id == current.id)
        .first()
    )
    if stored:
        stored.revoked = True
        db.commit()
    return MessageOut(message="Logged out")
