from calendar import monthrange
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.policy import Holiday
from app.models.user import User
from app.schemas import HolidayCreate, HolidayOut, HolidayUpdate, MessageOut
from app.services.audit_service import log_audit
from app.services.holiday_service import holiday_types, upcoming_holidays
from app.services.notification_service import NotificationService
from app.services.settings_service import get_bool_setting

router = APIRouter(prefix="/holidays", tags=["holidays"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _to_out(row: Holiday) -> HolidayOut:
    return HolidayOut(
        holiday_id=row.holiday_id,
        holiday_date=row.holiday_date,
        holiday_name=row.holiday_name,
        holiday_type=row.holiday_type,
        created_date=row.created_date,
    )


def _normalize_type(db: Session, raw: str) -> str:
    value = raw.strip().upper()
    allowed = holiday_types(db)
    if value not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid holiday type. Allowed: {', '.join(allowed)}",
        )
    return value


def _next_id(db: Session) -> int:
    current = db.query(func.max(Holiday.holiday_id)).scalar()
    return int(current or 0) + 1


def _assert_unique_date(db: Session, holiday_date: date, exclude_id: int | None = None) -> None:
    if get_bool_setting(db, "ALLOW_MULTIPLE_HOLIDAYS_PER_DATE", False):
        return
    query = db.query(Holiday).filter(Holiday.holiday_date == holiday_date)
    if exclude_id is not None:
        query = query.filter(Holiday.holiday_id != exclude_id)
    if query.first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A holiday already exists on this date")


async def _notify_holiday_change(db: Session, title: str, message: str, holiday_id: int) -> None:
    if not get_bool_setting(db, "NOTIFY_EMPLOYEES_ON_HOLIDAY_CHANGE", True):
        return
    notifier = NotificationService(db)
    users = db.query(User).filter(User.is_deleted == False).all()  # noqa: E712
    for user in users:
        await notifier.send_in_app(
            user_id=user.id,
            title=title,
            message=message,
            notification_type="HOLIDAY",
            related_entity="Holiday",
            related_entity_id=str(holiday_id),
        )


@router.get("", response_model=list[HolidayOut])
def list_holidays(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    year: int | None = Query(None, ge=2000, le=2100),
    month: int | None = Query(None, ge=1, le=12),
    from_date: date | None = None,
    to_date: date | None = None,
    holiday_type: str | None = None,
):
    query = db.query(Holiday)
    if year and month:
        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])
        query = query.filter(Holiday.holiday_date >= start, Holiday.holiday_date <= end)
    elif year:
        query = query.filter(Holiday.holiday_date >= date(year, 1, 1), Holiday.holiday_date <= date(year, 12, 31))
    if from_date:
        query = query.filter(Holiday.holiday_date >= from_date)
    if to_date:
        query = query.filter(Holiday.holiday_date <= to_date)
    if holiday_type:
        query = query.filter(Holiday.holiday_type == holiday_type.strip().upper())
    rows = query.order_by(Holiday.holiday_date, Holiday.holiday_name).all()
    return [_to_out(row) for row in rows]


@router.get("/types", response_model=list[str])
def list_holiday_types(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return holiday_types(db)


@router.get("/upcoming", response_model=list[HolidayOut])
def list_upcoming_holidays(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(5, ge=1, le=20),
):
    return [_to_out(row) for row in upcoming_holidays(db, limit=limit)]


@router.get("/{holiday_id}", response_model=HolidayOut)
def get_holiday(
    holiday_id: int,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    row = db.query(Holiday).filter(Holiday.holiday_id == holiday_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found")
    return _to_out(row)


@router.post("", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    body: HolidayCreate,
    request: Request,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    holiday_type = _normalize_type(db, body.holiday_type)
    name = body.holiday_name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Holiday name is required")
    _assert_unique_date(db, body.holiday_date)

    row = Holiday(
        holiday_id=_next_id(db),
        holiday_date=body.holiday_date,
        holiday_name=name,
        holiday_type=holiday_type,
        created_date=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    log_audit(
        db,
        user_id=current.id,
        action="CREATE",
        entity="Holiday",
        entity_id=str(row.holiday_id),
        new_values={
            "holiday_date": str(row.holiday_date),
            "holiday_name": row.holiday_name,
            "holiday_type": row.holiday_type,
        },
        ip_address=_client_ip(request),
    )
    formatted = row.holiday_date.strftime("%d %B %Y")
    await _notify_holiday_change(
        db,
        "New Holiday Added",
        f"{row.holiday_name} has been added to the company holiday calendar for {formatted}.",
        row.holiday_id,
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.put("/{holiday_id}", response_model=HolidayOut)
async def update_holiday(
    holiday_id: int,
    body: HolidayUpdate,
    request: Request,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    row = db.query(Holiday).filter(Holiday.holiday_id == holiday_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found")

    old = {
        "holiday_date": str(row.holiday_date),
        "holiday_name": row.holiday_name,
        "holiday_type": row.holiday_type,
    }
    data = body.model_dump(exclude_unset=True)
    if "holiday_name" in data:
        data["holiday_name"] = (data["holiday_name"] or "").strip()
        if not data["holiday_name"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Holiday name is required")
    if "holiday_type" in data and data["holiday_type"]:
        data["holiday_type"] = _normalize_type(db, data["holiday_type"])
    next_date = data.get("holiday_date", row.holiday_date)
    _assert_unique_date(db, next_date, exclude_id=row.holiday_id)

    for key, value in data.items():
        setattr(row, key, value)

    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="Holiday",
        entity_id=str(row.holiday_id),
        old_values=old,
        new_values={k: str(v) if isinstance(v, date) else v for k, v in data.items()},
        ip_address=_client_ip(request),
    )
    formatted = row.holiday_date.strftime("%d %B %Y")
    await _notify_holiday_change(
        db,
        "Holiday Updated",
        f"{row.holiday_name} on the company holiday calendar is now {formatted}.",
        row.holiday_id,
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{holiday_id}", response_model=MessageOut)
def delete_holiday(
    holiday_id: int,
    request: Request,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    row = db.query(Holiday).filter(Holiday.holiday_id == holiday_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found")
    old = {
        "holiday_date": str(row.holiday_date),
        "holiday_name": row.holiday_name,
        "holiday_type": row.holiday_type,
        "created_date": str(row.created_date) if row.created_date else None,
    }
    db.delete(row)
    log_audit(
        db,
        user_id=current.id,
        action="DELETE",
        entity="Holiday",
        entity_id=str(holiday_id),
        old_values=old,
        new_values=None,
        ip_address=_client_ip(request),
    )
    db.commit()
    return MessageOut(message="Holiday deleted")
