from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser
from app.models.user import User, UserRole


def load_user(db: Session, user_id: str) -> User | None:
    return (
        db.query(User)
        .options(
            joinedload(User.user_roles).joinedload(UserRole.role),
            joinedload(User.reporting_manager),
        )
        .filter(User.id == user_id, User.is_deleted == False)  # noqa: E712
        .first()
    )


def user_role_names(user: User) -> list[str]:
    return [ur.role.name for ur in user.user_roles if ur.role]


def get_visible_user(db: Session, current: CurrentUser, user_id: str) -> User:
    if user_id in {current.id, "me"}:
        return current.user

    user = load_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    if current.has_role("HR", "SUPERADMIN"):
        return user
    if current.has_role("MANAGER") and user.reporting_manager_id == current.id:
        return user

    raise HTTPException(status_code=403, detail="You cannot view this employee")
