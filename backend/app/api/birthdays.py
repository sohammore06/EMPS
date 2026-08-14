from calendar import monthrange
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.models.user import User
from app.schemas import BirthdayOut
from app.utils.helpers import birthday_this_year

router = APIRouter(prefix="/birthdays", tags=["birthdays"])


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
                results.append(
                    BirthdayOut(
                        id=u.id,
                        name=u.full_name,
                        email=u.email,
                        department=u.department.name if u.department else None,
                        designation=u.designation.name if u.designation else None,
                        date_of_birth=u.date_of_birth,
                        birthday_this_year=bd,
                    )
                )
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
