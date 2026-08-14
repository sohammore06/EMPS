from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.user import User
from app.schemas import CalendarEventOut, EventEmployeeOut, EventUpsert, MessageOut
from app.services.audit_service import log_audit
from app.utils.helpers import birthday_this_year, years_elapsed

EventType = Literal["BIRTHDAY", "WORK_ANNIVERSARY"]

router = APIRouter(prefix="/events", tags=["events"])


def _validate_event_date(event_date: date) -> None:
    today = date.today()
    if event_date > today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event date cannot be in the future")
    if event_date.year < 1900:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event date year is invalid")


def _active_user(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False).first()  # noqa: E712
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return user


def _event_out(user: User, event_type: EventType, original: date, occurs_on: date) -> CalendarEventOut:
    return CalendarEventOut(
        id=f"{user.id}:{event_type}",
        user_id=user.id,
        name=user.full_name,
        email=user.email,
        department=user.department.name if user.department else None,
        designation=user.designation.name if user.designation else None,
        event_type=event_type,
        event_date=original,
        occurs_on=occurs_on,
        years=years_elapsed(original, occurs_on),
    )


def _source_date(user: User, event_type: EventType) -> date | None:
    if event_type == "BIRTHDAY":
        return user.date_of_birth
    return user.date_of_joining


def _collect(db: Session, start: date, end: date, event_type: EventType | None = None) -> list[CalendarEventOut]:
    users = db.query(User).filter(User.is_deleted == False).all()  # noqa: E712
    results: list[CalendarEventOut] = []
    kinds: list[EventType] = [event_type] if event_type else ["BIRTHDAY", "WORK_ANNIVERSARY"]
    for user in users:
        for kind in kinds:
            original = _source_date(user, kind)
            if original is None:
                continue
            candidates = [birthday_this_year(original, start.year)]
            if start.year != end.year:
                candidates.append(birthday_this_year(original, end.year))
            for occurs in candidates:
                if start <= occurs <= end:
                    results.append(_event_out(user, kind, original, occurs))
                    break
    results.sort(key=lambda item: (item.occurs_on, item.event_type, item.name))
    return results


@router.get("/upcoming", response_model=list[CalendarEventOut])
def events_upcoming(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(60, ge=1, le=366),
    event_type: EventType | None = Query(None),
):
    today = date.today()
    return _collect(db, today, today + timedelta(days=days), event_type)


@router.get("/month", response_model=list[CalendarEventOut])
def events_month(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000, le=2100),
    event_type: EventType | None = Query(None),
):
    today = date.today()
    m = month or today.month
    y = year or today.year
    start = date(y, m, 1)
    end = date(y, m, monthrange(y, m)[1])
    return _collect(db, start, end, event_type)


@router.get("/employees", response_model=list[EventEmployeeOut])
def event_employees(
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
        EventEmployeeOut(
            id=u.id,
            name=u.full_name,
            email=u.email,
            employee_code=u.employee_code,
            department=u.department.name if u.department else None,
            designation=u.designation.name if u.designation else None,
            date_of_birth=u.date_of_birth,
            date_of_joining=u.date_of_joining,
        )
        for u in users
    ]


@router.put("/{user_id}", response_model=CalendarEventOut)
def upsert_event(
    user_id: str,
    body: EventUpsert,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    _validate_event_date(body.event_date)
    user = _active_user(db, user_id)
    field = "date_of_birth" if body.event_type == "BIRTHDAY" else "date_of_joining"
    old = getattr(user, field)
    old_value = str(old) if old else None
    setattr(user, field, body.event_date)
    user.updated_at = datetime.utcnow()
    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="User",
        entity_id=user.id,
        old_values={field: old_value},
        new_values={field: str(body.event_date)},
    )
    db.commit()
    db.refresh(user)
    occurs = birthday_this_year(body.event_date)
    return _event_out(user, body.event_type, body.event_date, occurs)


@router.delete("/{user_id}", response_model=MessageOut)
def clear_event(
    user_id: str,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
    event_type: EventType = Query(...),
):
    user = _active_user(db, user_id)
    field = "date_of_birth" if event_type == "BIRTHDAY" else "date_of_joining"
    old = getattr(user, field)
    old_value = str(old) if old else None
    setattr(user, field, None)
    user.updated_at = datetime.utcnow()
    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="User",
        entity_id=user.id,
        old_values={field: old_value},
        new_values={field: None},
    )
    db.commit()
    label = "Birthday" if event_type == "BIRTHDAY" else "Work anniversary"
    return MessageOut(message=f"{label} removed")
