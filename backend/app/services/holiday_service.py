from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.policy import Holiday
from app.services.settings_service import get_bool_setting, get_csv_setting, get_int_list_setting
from app.utils.helpers import leave_days


def holiday_types(db: Session) -> list[str]:
    types = [item.upper() for item in get_csv_setting(db, "HOLIDAY_TYPES", "PUBLIC,COMPANY,OPTIONAL,FESTIVAL,OTHER")]
    return types or ["PUBLIC", "COMPANY", "OPTIONAL", "FESTIVAL", "OTHER"]


def weekend_days(db: Session) -> set[int]:
    days = get_int_list_setting(db, "WEEKEND_DAYS", "5,6")
    return set(days or [5, 6])


def holidays_in_range(db: Session, start: date, end: date) -> list[Holiday]:
    return (
        db.query(Holiday)
        .filter(Holiday.holiday_date >= start, Holiday.holiday_date <= end)
        .order_by(Holiday.holiday_date, Holiday.holiday_name)
        .all()
    )


def holiday_dates_in_range(db: Session, start: date, end: date) -> set[date]:
    return {row.holiday_date for row in holidays_in_range(db, start, end)}


def holiday_on(db: Session, day: date) -> Holiday | None:
    return db.query(Holiday).filter(Holiday.holiday_date == day).first()


def upcoming_holidays(db: Session, *, limit: int = 5, from_date: date | None = None) -> list[Holiday]:
    start = from_date or date.today()
    return (
        db.query(Holiday)
        .filter(Holiday.holiday_date >= start)
        .order_by(Holiday.holiday_date, Holiday.holiday_name)
        .limit(limit)
        .all()
    )


def calculate_leave_days(db: Session, from_date: date, to_date: date, is_half_day: bool) -> Decimal:
    holiday_dates = holiday_dates_in_range(db, from_date, to_date)
    return leave_days(
        from_date,
        to_date,
        is_half_day,
        holiday_dates=holiday_dates,
        count_weekends=get_bool_setting(db, "COUNT_WEEKENDS_AS_LEAVE", False),
        count_holidays=get_bool_setting(db, "COUNT_HOLIDAYS_AS_LEAVE", False),
        weekend_days=weekend_days(db),
    )


def is_chargeable_day(day: date, *, holiday_dates: set[date], count_weekends: bool, count_holidays: bool, weekend_days: set[int]) -> bool:
    if not count_weekends and day.weekday() in weekend_days:
        return False
    if not count_holidays and day in holiday_dates:
        return False
    return True


def daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)
