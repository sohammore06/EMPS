from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.user import User
from app.schemas import BirthdayEmployeeOut, BirthdayOut, BirthdayUpsert, MessageOut
from app.services.audit_service import log_audit
from app.utils.helpers import birthday_this_year

router = APIRouter(prefix="/birthdays", tags=["birthdays"])


def _validate_date_of_birth(dob: date) -> None:
    today = date.today()
    if dob > today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date of birth cannot be in the future")
    if dob.year < 1900:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date of birth year is invalid")


def _active_user(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False).first()  # noqa: E712
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return user


def _birthday_out(user: User, year: int | None = None) -> BirthdayOut:
    assert user.date_of_birth is not None
    return BirthdayOut(
        id=user.id,
        name=user.full_name,
        email=user.email,
        department=user.department.name if user.department else None,
        designation=user.designation.name if user.designation else None,
        date_of_birth=user.date_of_birth,
        birthday_this_year=birthday_this_year(user.date_of_birth, year),
    )


def _collect(db: Session, start: date, end: date) -> list[BirthdayOut]:
    users = (
        db.query(User)
        .filter(User.is_deleted == False, User.date_of_birth.isnot(None))  # noqa: E712
        .all()
    )
    results: list[BirthdayOut] = []
    for u in users:
        assert u.date_of_birth is not None
        candidates = [birthday_this_year(u.date_of_birth, start.year)]
        if start.year != end.year:
            candidates.append(birthday_this_year(u.date_of_birth, end.year))
        for bd in candidates:
            if start <= bd <= end:
                results.append(_birthday_out(u, bd.year))
                break
    results.sort(key=lambda x: x.birthday_this_year)
    return results


@router.get("/today", response_model=list[BirthdayOut])
def birthdays_today(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    return _collect(db, today, today)


@router.get("/week", response_model=list[BirthdayOut])
def birthdays_week(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    return _collect(db, today, today + timedelta(days=6))


@router.get("/upcoming", response_model=list[BirthdayOut])
def birthdays_upcoming(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(60, ge=1, le=366),
):
    today = date.today()
    return _collect(db, today, today + timedelta(days=days))


@router.get("/month", response_model=list[BirthdayOut])
def birthdays_month(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000, le=2100),
):
    today = date.today()
    m = month or today.month
    y = year or today.year
    start = date(y, m, 1)
    end = date(y, m, monthrange(y, m)[1])
    return _collect(db, start, end)


@router.get("/employees", response_model=list[BirthdayEmployeeOut])
def birthday_employees(
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
    q: str | None = None,
):
    query = db.query(User).filter(User.is_deleted == False)  # noqa: E712
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            (func.lower(User.first_name).like(like))
            | (func.lower(User.last_name).like(like))
            | (func.lower(User.email).like(like))
            | (func.lower(User.employee_code).like(like))
        )
    users = query.order_by(User.first_name, User.last_name).limit(500).all()
    return [
        BirthdayEmployeeOut(
            id=u.id,
            name=u.full_name,
            email=u.email,
            employee_code=u.employee_code,
            department=u.department.name if u.department else None,
            designation=u.designation.name if u.designation else None,
            date_of_birth=u.date_of_birth,
        )
        for u in users
    ]


@router.put("/{user_id}", response_model=BirthdayOut)
def upsert_birthday(
    user_id: str,
    body: BirthdayUpsert,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    _validate_date_of_birth(body.date_of_birth)
    user = _active_user(db, user_id)
    old = str(user.date_of_birth) if user.date_of_birth else None
    user.date_of_birth = body.date_of_birth
    user.updated_at = datetime.utcnow()
    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="User",
        entity_id=user.id,
        old_values={"date_of_birth": old},
        new_values={"date_of_birth": str(body.date_of_birth)},
    )
    db.commit()
    db.refresh(user)
    return _birthday_out(user)


@router.delete("/{user_id}", response_model=MessageOut)
def clear_birthday(
    user_id: str,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    user = _active_user(db, user_id)
    old = str(user.date_of_birth) if user.date_of_birth else None
    user.date_of_birth = None
    user.updated_at = datetime.utcnow()
    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="User",
        entity_id=user.id,
        old_values={"date_of_birth": old},
        new_values={"date_of_birth": None},
    )
    db.commit()
    return MessageOut(message="Birthday removed")
