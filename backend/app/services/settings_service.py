from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.org import SystemSetting

SETTING_DEFAULTS: dict[str, tuple[str, str]] = {
    "COUNT_WEEKENDS_AS_LEAVE": ("false", "Count weekend days as chargeable leave"),
    "COUNT_HOLIDAYS_AS_LEAVE": ("false", "Count company holidays as chargeable leave"),
    "WEEKEND_DAYS": ("5,6", "Python weekday numbers treated as weekend (0=Mon ... 6=Sun)"),
    "HOLIDAY_TYPES": ("PUBLIC,COMPANY,OPTIONAL,FESTIVAL,OTHER", "Allowed holiday types"),
    "ALLOW_MULTIPLE_HOLIDAYS_PER_DATE": ("false", "Allow more than one holiday on the same date"),
    "NOTIFY_EMPLOYEES_ON_HOLIDAY_CHANGE": ("true", "Send in-app notifications when holidays change"),
}


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.query(SystemSetting).filter(SystemSetting.setting_key == key).first()
    if row and row.setting_value is not None and row.setting_value != "":
        return row.setting_value
    if default is not None:
        return default
    preset = SETTING_DEFAULTS.get(key)
    return preset[0] if preset else None


def get_bool_setting(db: Session, key: str, default: bool = False) -> bool:
    raw = (get_setting(db, key, "true" if default else "false") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def get_csv_setting(db: Session, key: str, default: str = "") -> list[str]:
    raw = get_setting(db, key, default) or ""
    return [part.strip() for part in raw.split(",") if part.strip()]


def get_int_list_setting(db: Session, key: str, default: str = "") -> list[int]:
    values: list[int] = []
    for part in get_csv_setting(db, key, default):
        try:
            values.append(int(part))
        except ValueError:
            continue
    return values


def ensure_default_settings(db: Session) -> None:
    for key, (value, description) in SETTING_DEFAULTS.items():
        existing = db.query(SystemSetting).filter(SystemSetting.setting_key == key).first()
        if not existing:
            db.add(
                SystemSetting(
                    id=str(uuid4()),
                    setting_key=key,
                    setting_value=value,
                    description=description,
                )
            )
