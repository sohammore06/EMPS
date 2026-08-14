from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.attendance import WorkShift
from app.models.org import SystemSetting
from app.models.user import User


def get_user_shift(db: Session, user: User) -> WorkShift | None:
    if user.work_shift_id:
        shift = db.query(WorkShift).filter(WorkShift.id == user.work_shift_id).first()
        if shift:
            return shift

    setting = (
        db.query(SystemSetting)
        .filter(SystemSetting.setting_key == "DEFAULT_WORK_SHIFT_ID")
        .first()
    )
    if setting and setting.setting_value:
        return db.query(WorkShift).filter(WorkShift.id == setting.setting_value).first()

    return db.query(WorkShift).order_by(WorkShift.name).first()


def calculate_worked_minutes(check_in: datetime, check_out: datetime) -> int:
    delta = check_out - check_in
    return max(int(delta.total_seconds() // 60), 0)


def calculate_overtime(worked_minutes: int, shift: WorkShift | None) -> int:
    if not shift:
        standard = 8 * 60
    else:
        start = datetime.combine(date.today(), shift.start_time)
        end = datetime.combine(date.today(), shift.end_time)
        if end <= start:
            end += timedelta(days=1)
        standard = int((end - start).total_seconds() // 60)
    return max(worked_minutes - standard, 0)


def leave_days(
    from_date: date,
    to_date: date,
    is_half_day: bool,
) -> Decimal:
    if is_half_day:
        return Decimal("0.5")
    days = (to_date - from_date).days + 1
    return Decimal(str(max(days, 0)))


def birthday_this_year(dob: date, year: int | None = None) -> date:
    y = year or date.today().year
    try:
        return dob.replace(year=y)
    except ValueError:
        # Feb 29 -> Feb 28 on non-leap years
        return date(y, 2, 28)
