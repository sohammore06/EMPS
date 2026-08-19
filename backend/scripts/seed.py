"""Seed roles, leave types, default work shift, and local test users."""

from __future__ import annotations

import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

# Ensure backend root is on path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import inspect

from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
import app.models  # noqa: F401
from app.models.attendance import WorkShift
from app.models.leave import EmployeeLeaveBalance, LeaveType
from app.models.org import SystemSetting
from app.models.policy import Holiday
from app.models.skill import Skill
from app.models.user import Role, User, UserRole
from app.services.settings_service import ensure_default_settings


ROLES = [
    ("SUPERADMIN", "Full system access"),
    ("HR", "Human resources administration"),
    ("MANAGER", "Team manager"),
    ("EMPLOYEE", "Standard employee"),
]

LEAVE_TYPES = [
    ("CL", "Casual Leave"),
    ("PL", "Privilege Leave"),
    ("SL", "Sick Leave"),
    ("LOP", "Loss of Pay"),
]

# Local test accounts — password is Password@123 for all
TEST_USERS = [
    {
        "email": "superadmin@intellifysolutions.com",
        "first_name": "Super",
        "last_name": "Admin",
        "employee_code": "SA001",
        "roles": ["SUPERADMIN"],
        "date_of_joining": date(2018, 1, 15),
    },
    {
        "email": "hr@intellifysolutions.com",
        "first_name": "Guest",
        "last_name": "HR",
        "employee_code": "HR001",
        "roles": ["HR", "EMPLOYEE"],
        "date_of_joining": date(2020, 3, 10),
    },
    {
        "email": "sohammore@intellifysolutions.com",
        "first_name": "Soham",
        "last_name": "More",
        "employee_code": "EMP001",
        "roles": ["EMPLOYEE"],
        "date_of_birth": date(1998, 8, 7),
        "date_of_joining": date(2022, 8, 20),
        "seed_leave_balances": True,
    },
]

LOCAL_PASSWORD = "Password@123"

STANDARD_SKILLS = [
    ("Python", "Technical"),
    ("Java", "Technical"),
    ("JavaScript", "Technical"),
    ("TypeScript", "Technical"),
    ("React", "Technical"),
    ("Next.js", "Technical"),
    ("Node.js", "Technical"),
    ("SQL Server", "Technical"),
    ("PostgreSQL", "Technical"),
    ("FastAPI", "Technical"),
    (".NET", "Technical"),
    ("Azure", "Technical"),
    ("AWS", "Technical"),
    ("Docker", "Technical"),
    ("Git", "Technical"),
    ("Power BI", "Technical"),
    ("Excel", "Technical"),
    ("Communication", "Soft Skills"),
    ("Leadership", "Soft Skills"),
    ("Project Management", "Soft Skills"),
    ("Mentoring", "Soft Skills"),
    ("Recruitment", "HR"),
    ("Payroll", "HR"),
    ("Employee Relations", "HR"),
]

SAMPLE_HOLIDAYS = [
    (date(2026, 8, 15), "Independence Day", "PUBLIC"),
    (date(2026, 8, 27), "Ganesh Chaturthi", "FESTIVAL"),
    (date(2026, 10, 2), "Gandhi Jayanti", "PUBLIC"),
    (date(2026, 11, 8), "Diwali", "FESTIVAL"),
    (date(2026, 12, 25), "Christmas", "PUBLIC"),
]


def _ensure_holidays_schema() -> None:
    inspector = inspect(engine)
    tables = {name.lower() for name in inspector.get_table_names()}
    if "holidays" not in tables:
        Holiday.__table__.create(bind=engine)
        return
    actual_name = next(name for name in inspector.get_table_names() if name.lower() == "holidays")
    columns = {col["name"] for col in inspector.get_columns(actual_name)}
    if {"holiday_id", "holiday_name", "holiday_type", "holiday_date"} <= columns:
        return
    Holiday.__table__.drop(bind=engine)
    Holiday.__table__.create(bind=engine)
    print("Recreated Holidays table to match dbo.Holidays")


def _ensure_role(db, role_name: str) -> Role:
    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        role = Role(id=str(uuid4()), name=role_name, description=role_name)
        db.add(role)
        db.flush()
        print(f"Created role: {role_name}")
    return role


def _ensure_user_role(db, user_id: str, role_id: str) -> None:
    exists = (
        db.query(UserRole)
        .filter(UserRole.user_id == user_id, UserRole.role_id == role_id)
        .first()
    )
    if not exists:
        db.add(UserRole(id=str(uuid4()), user_id=user_id, role_id=role_id))


def _seed_leave_balances(db, user_id: str) -> None:
    defaults = {"CL": Decimal("8"), "PL": Decimal("12"), "SL": Decimal("6"), "LOP": Decimal("0")}
    for code, balance in defaults.items():
        lt = db.query(LeaveType).filter(LeaveType.code == code).first()
        if not lt:
            continue
        existing = (
            db.query(EmployeeLeaveBalance)
            .filter(
                EmployeeLeaveBalance.employee_id == user_id,
                EmployeeLeaveBalance.leave_type_id == lt.id,
            )
            .first()
        )
        if not existing:
            db.add(
                EmployeeLeaveBalance(
                    id=str(uuid4()),
                    employee_id=user_id,
                    leave_type_id=lt.id,
                    balance=balance,
                    last_updated=datetime.utcnow(),
                )
            )


def seed() -> None:
    settings = get_settings()
    if settings.USE_SQLITE:
        Base.metadata.create_all(bind=engine)
        _ensure_holidays_schema()

    db = SessionLocal()
    try:
        ensure_default_settings(db)
        for name, desc in ROLES:
            exists = db.query(Role).filter(Role.name == name).first()
            if not exists:
                db.add(Role(id=str(uuid4()), name=name, description=desc))
                print(f"Created role: {name}")

        for code, name in LEAVE_TYPES:
            exists = db.query(LeaveType).filter(LeaveType.code == code).first()
            if not exists:
                db.add(
                    LeaveType(
                        id=str(uuid4()),
                        code=code,
                        name=name,
                        is_active=True,
                        created_at=datetime.utcnow(),
                    )
                )
                print(f"Created leave type: {code}")

        shift = db.query(WorkShift).filter(WorkShift.name == "General Shift").first()
        if not shift:
            shift = WorkShift(
                id=str(uuid4()),
                name="General Shift",
                start_time=time(9, 0),
                end_time=time(18, 0),
                grace_minutes=15,
                minimum_hours_for_full_day=8,
            )
            db.add(shift)
            db.flush()
            print(f"Created work shift: General Shift ({shift.id})")

        setting = (
            db.query(SystemSetting)
            .filter(SystemSetting.setting_key == "DEFAULT_WORK_SHIFT_ID")
            .first()
        )
        if not setting:
            db.add(
                SystemSetting(
                    id=str(uuid4()),
                    setting_key="DEFAULT_WORK_SHIFT_ID",
                    setting_value=shift.id,
                    description="Default work shift for employees without assignment",
                )
            )
            print("Created DEFAULT_WORK_SHIFT_ID setting")
        elif not setting.setting_value:
            setting.setting_value = shift.id

        password_hash = hash_password(LOCAL_PASSWORD)
        now = datetime.utcnow()

        for spec in TEST_USERS:
            email = spec["email"].lower()
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    id=str(uuid4()),
                    email=email,
                    employee_code=spec.get("employee_code"),
                    first_name=spec.get("first_name"),
                    last_name=spec.get("last_name"),
                    password_hash=password_hash,
                    employment_status="Active",
                    date_of_joining=spec.get("date_of_joining") or date.today(),
                    date_of_birth=spec.get("date_of_birth"),
                    work_shift_id=shift.id,
                    is_microsoft_account=False,
                    is_deleted=False,
                    created_at=now,
                    updated_at=now,
                )
                db.add(user)
                db.flush()
                print(f"Created user: {email}")
            else:
                user.password_hash = password_hash
                user.is_microsoft_account = False
                user.is_deleted = False
                user.updated_at = now
                if not user.work_shift_id:
                    user.work_shift_id = shift.id
                if spec.get("date_of_birth") and not user.date_of_birth:
                    user.date_of_birth = spec["date_of_birth"]
                if spec.get("date_of_joining"):
                    user.date_of_joining = spec["date_of_joining"]
                print(f"Updated local login for: {email}")

            for role_name in spec["roles"]:
                role = _ensure_role(db, role_name)
                _ensure_user_role(db, user.id, role.id)

            if spec.get("seed_leave_balances"):
                _seed_leave_balances(db, user.id)

        # Point employee reporting manager to HR guest for leave-approval testing
        employee = (
            db.query(User)
            .filter(User.email == "sohammore@intellifysolutions.com")
            .first()
        )
        hr = db.query(User).filter(User.email == "hr@intellifysolutions.com").first()
        if employee and hr and employee.reporting_manager_id != hr.id:
            employee.reporting_manager_id = hr.id
            # HR also needs MANAGER role for team leave pending endpoint as reporting manager
            manager_role = _ensure_role(db, "MANAGER")
            _ensure_user_role(db, hr.id, manager_role.id)
            print("Set hr@ as reporting manager for sohammore@")

        for skill_name, category in STANDARD_SKILLS:
            exists = db.query(Skill).filter(Skill.name == skill_name).first()
            if not exists:
                db.add(
                    Skill(
                        id=str(uuid4()),
                        name=skill_name,
                        category=category,
                        is_active=True,
                    )
                )

        if db.query(Holiday).count() == 0:
            for holiday_date, holiday_name, holiday_type in SAMPLE_HOLIDAYS:
                db.add(
                    Holiday(
                        holiday_date=holiday_date,
                        holiday_name=holiday_name,
                        holiday_type=holiday_type,
                        created_date=datetime.utcnow(),
                    )
                )
            print("Seeded sample holidays")

        db.commit()
        print("Seed completed.")
        print("")
        print("Local login accounts (password: Password@123):")
        print("  superadmin@intellifysolutions.com  -> SUPERADMIN")
        print("  hr@intellifysolutions.com           -> HR (+ MANAGER for approvals)")
        print("  sohammore@intellifysolutions.com    -> EMPLOYEE")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
