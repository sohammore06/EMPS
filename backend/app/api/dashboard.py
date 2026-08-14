from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.attendance import AttendanceRecord
from app.models.leave import EmployeeLeaveBalance, LeaveRequest
from app.models.user import User
from app.schemas import EmployeeDashboard, HRDashboard, ManagerDashboard, NotificationOut
from app.models.org import Notification
from app.utils.helpers import birthday_this_year

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/hr", response_model=HRDashboard)
def hr_dashboard(
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    total = db.query(func.count(User.id)).filter(User.is_deleted == False).scalar() or 0  # noqa: E712

    present = (
        db.query(func.count(AttendanceRecord.id))
        .filter(
            AttendanceRecord.attendance_date == today,
            AttendanceRecord.work_mode == "OFFICE",
            AttendanceRecord.check_in_time.isnot(None),
        )
        .scalar()
        or 0
    )
    wfh = (
        db.query(func.count(AttendanceRecord.id))
        .filter(
            AttendanceRecord.attendance_date == today,
            AttendanceRecord.work_mode == "WFH",
            AttendanceRecord.check_in_time.isnot(None),
        )
        .scalar()
        or 0
    )
    on_leave = (
        db.query(func.count(LeaveRequest.id))
        .filter(
            LeaveRequest.status == "APPROVED",
            LeaveRequest.from_date <= today,
            LeaveRequest.to_date >= today,
        )
        .scalar()
        or 0
    )
    pending = (
        db.query(func.count(LeaveRequest.id)).filter(LeaveRequest.status == "PENDING").scalar() or 0
    )

    birthday_count = 0
    for u in db.query(User).filter(User.is_deleted == False, User.date_of_birth.isnot(None)).all():  # noqa: E712
        if birthday_this_year(u.date_of_birth) == today:
            birthday_count += 1

    return HRDashboard(
        total_employees=total,
        present_today=present,
        wfh_today=wfh,
        employees_on_leave_today=on_leave,
        today_birthdays=birthday_count,
        pending_leave_requests=pending,
    )


@router.get("/dashboard/manager", response_model=ManagerDashboard)
def manager_dashboard(
    current: Annotated[CurrentUser, Depends(require_roles("MANAGER", "HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    team = (
        db.query(User)
        .filter(User.reporting_manager_id == current.id, User.is_deleted == False)  # noqa: E712
        .all()
    )
    team_ids = [u.id for u in team]
    if not team_ids:
        return ManagerDashboard(
            team_size=0,
            present_today=0,
            wfh_today=0,
            on_leave_today=0,
            pending_leave_requests=0,
        )

    present = (
        db.query(func.count(AttendanceRecord.id))
        .filter(
            AttendanceRecord.attendance_date == today,
            AttendanceRecord.user_id.in_(team_ids),
            AttendanceRecord.work_mode == "OFFICE",
        )
        .scalar()
        or 0
    )
    wfh = (
        db.query(func.count(AttendanceRecord.id))
        .filter(
            AttendanceRecord.attendance_date == today,
            AttendanceRecord.user_id.in_(team_ids),
            AttendanceRecord.work_mode == "WFH",
        )
        .scalar()
        or 0
    )
    on_leave = (
        db.query(func.count(LeaveRequest.id))
        .filter(
            LeaveRequest.employee_id.in_(team_ids),
            LeaveRequest.status == "APPROVED",
            LeaveRequest.from_date <= today,
            LeaveRequest.to_date >= today,
        )
        .scalar()
        or 0
    )
    pending = (
        db.query(func.count(LeaveRequest.id))
        .filter(LeaveRequest.employee_id.in_(team_ids), LeaveRequest.status == "PENDING")
        .scalar()
        or 0
    )
    return ManagerDashboard(
        team_size=len(team_ids),
        present_today=present,
        wfh_today=wfh,
        on_leave_today=on_leave,
        pending_leave_requests=pending,
    )


@router.get("/dashboard/me", response_model=EmployeeDashboard)
def employee_dashboard(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    att = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.user_id == current.id, AttendanceRecord.attendance_date == today)
        .first()
    )
    bal_total = (
        db.query(func.coalesce(func.sum(EmployeeLeaveBalance.balance), 0))
        .filter(EmployeeLeaveBalance.employee_id == current.id)
        .scalar()
    )
    pending = (
        db.query(func.count(LeaveRequest.id))
        .filter(LeaveRequest.employee_id == current.id, LeaveRequest.status == "PENDING")
        .scalar()
        or 0
    )

    upcoming = 0
    for u in db.query(User).filter(User.is_deleted == False, User.date_of_birth.isnot(None)).all():  # noqa: E712
        bd = birthday_this_year(u.date_of_birth)
        delta = (bd - today).days
        if 0 <= delta <= 7:
            upcoming += 1

    month_start = date(today.year, today.month, 1)
    worked = (
        db.query(func.coalesce(func.sum(AttendanceRecord.total_minutes_worked), 0))
        .filter(
            AttendanceRecord.user_id == current.id,
            AttendanceRecord.attendance_date >= month_start,
            AttendanceRecord.attendance_date <= today,
        )
        .scalar()
    )

    return EmployeeDashboard(
        checked_in_today=bool(att and att.check_in_time),
        checked_out_today=bool(att and att.check_out_time),
        today_work_mode=att.work_mode if att else None,
        leave_balance_total=Decimal(str(bal_total or 0)),
        pending_leaves=pending,
        upcoming_birthdays=upcoming,
        month_worked_minutes=int(worked or 0),
    )


@router.get("/notifications", response_model=list[NotificationOut])
def my_notifications(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    unread_only: bool = False,
):
    q = db.query(Notification).filter(Notification.user_id == current.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    rows = q.order_by(Notification.created_at.desc()).limit(50).all()
    return [NotificationOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/notifications/{notification_id}/read")
def mark_read(
    notification_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    note = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current.id)
        .first()
    )
    if note:
        note.is_read = True
        db.commit()
    return {"message": "ok"}
