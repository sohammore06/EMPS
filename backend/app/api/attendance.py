import csv
import io
from datetime import date, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.attendance import AttendanceRecord
from app.models.user import User
from app.schemas import AttendanceOut, AttendanceSummary, CheckInRequest, CheckOutRequest, MessageOut
from app.services.audit_service import log_audit
from app.services.holiday_service import holiday_on, holidays_in_range
from app.utils.helpers import calculate_overtime, calculate_worked_minutes, get_user_shift

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _to_out(rec: AttendanceRecord, name: str | None = None) -> AttendanceOut:
    return AttendanceOut(
        id=rec.id,
        user_id=rec.user_id,
        attendance_date=rec.attendance_date,
        work_mode=rec.work_mode,
        check_in_time=rec.check_in_time,
        check_out_time=rec.check_out_time,
        total_minutes_worked=rec.total_minutes_worked,
        overtime_minutes=rec.overtime_minutes or 0,
        status=rec.status,
        notes=rec.notes,
        employee_name=name,
    )


@router.post("/check-in", response_model=AttendanceOut)
def check_in(
    body: CheckInRequest,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    existing = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.user_id == current.id, AttendanceRecord.attendance_date == today)
        .first()
    )
    if existing and existing.check_in_time:
        raise HTTPException(status_code=400, detail="Already checked in today")

    now = datetime.utcnow()
    if existing:
        existing.check_in_time = now
        existing.work_mode = body.work_mode
        existing.status = "PRESENT"
        existing.notes = body.notes
        existing.updated_at = now
        rec = existing
    else:
        rec = AttendanceRecord(
            id=str(uuid4()),
            user_id=current.id,
            attendance_date=today,
            work_mode=body.work_mode,
            check_in_time=now,
            status="PRESENT",
            notes=body.notes,
            overtime_minutes=0,
            created_at=now,
            updated_at=now,
        )
        db.add(rec)

    log_audit(
        db,
        user_id=current.id,
        action="CHECK_IN",
        entity="AttendanceRecord",
        entity_id=rec.id,
        new_values={"work_mode": body.work_mode},
    )
    db.commit()
    db.refresh(rec)
    return _to_out(rec, current.user.full_name)


@router.post("/check-out", response_model=AttendanceOut)
def check_out(
    body: CheckOutRequest,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    rec = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.user_id == current.id, AttendanceRecord.attendance_date == today)
        .first()
    )
    if not rec or not rec.check_in_time:
        raise HTTPException(status_code=400, detail="Check-in required before check-out")
    if rec.check_out_time:
        raise HTTPException(status_code=400, detail="Already checked out today")

    now = datetime.utcnow()
    worked = calculate_worked_minutes(rec.check_in_time, now)
    shift = get_user_shift(db, current.user)
    overtime = calculate_overtime(worked, shift)

    rec.check_out_time = now
    rec.total_minutes_worked = worked
    rec.overtime_minutes = overtime
    if body.notes:
        rec.notes = ((rec.notes or "") + "\n" + body.notes).strip()
    rec.updated_at = now

    log_audit(
        db,
        user_id=current.id,
        action="CHECK_OUT",
        entity="AttendanceRecord",
        entity_id=rec.id,
        new_values={"total_minutes_worked": worked, "overtime_minutes": overtime},
    )
    db.commit()
    db.refresh(rec)
    return _to_out(rec, current.user.full_name)


@router.get("/today", response_model=AttendanceOut | None)
def today_attendance(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    today = date.today()
    rec = (
        db.query(AttendanceRecord)
        .filter(AttendanceRecord.user_id == current.id, AttendanceRecord.attendance_date == today)
        .first()
    )
    if rec:
        return _to_out(rec, current.user.full_name)
    holiday = holiday_on(db, today)
    if holiday:
        return AttendanceOut(
            id=f"holiday-{holiday.holiday_id}",
            user_id=current.id,
            attendance_date=today,
            work_mode=None,
            status="HOLIDAY",
            notes=holiday.holiday_name,
            employee_name=current.user.full_name,
        )
    return None


@router.get("/me", response_model=AttendanceSummary)
def my_attendance(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
):
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == current.id,
            AttendanceRecord.attendance_date >= start,
            AttendanceRecord.attendance_date < end,
        )
        .order_by(AttendanceRecord.attendance_date)
        .all()
    )

    recorded_dates = {r.attendance_date for r in records}
    month_end = end - date.resolution
    holiday_rows = holidays_in_range(db, start, month_end)
    outs = [_to_out(r) for r in records]
    for holiday in holiday_rows:
        if holiday.holiday_date in recorded_dates:
            continue
        if holiday.holiday_date > date.today() and holiday.holiday_date.month == month:
            # still show future holidays in the current/selected month
            pass
        outs.append(
            AttendanceOut(
                id=f"holiday-{holiday.holiday_id}",
                user_id=current.id,
                attendance_date=holiday.holiday_date,
                work_mode=None,
                status="HOLIDAY",
                notes=holiday.holiday_name,
                employee_name=current.user.full_name,
            )
        )
    outs.sort(key=lambda item: item.attendance_date)
    return AttendanceSummary(
        records=outs,
        total_worked_minutes=sum(r.total_minutes_worked or 0 for r in records),
        total_overtime_minutes=sum(r.overtime_minutes or 0 for r in records),
        present_count=sum(1 for r in records if r.work_mode == "OFFICE" and r.status == "PRESENT"),
        wfh_count=sum(1 for r in records if r.work_mode == "WFH"),
        leave_count=sum(1 for r in records if r.status == "LEAVE"),
        holiday_count=sum(1 for item in outs if item.status == "HOLIDAY"),
    )


@router.get("/team", response_model=list[AttendanceOut])
def team_attendance(
    current: Annotated[CurrentUser, Depends(require_roles("MANAGER", "HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
    attendance_date: date | None = None,
):
    day = attendance_date or date.today()
    q = (
        db.query(AttendanceRecord, User)
        .join(User, User.id == AttendanceRecord.user_id)
        .filter(AttendanceRecord.attendance_date == day, User.is_deleted == False)  # noqa: E712
    )
    if not current.has_role("HR", "SUPERADMIN"):
        q = q.filter(User.reporting_manager_id == current.id)

    rows = q.all()
    return [_to_out(rec, user.full_name) for rec, user in rows]


@router.get("/report")
def attendance_report(
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
    department_id: str | None = None,
    employee_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    work_mode: str | None = None,
    export: str | None = Query(None, pattern="^(csv)?$"),
):
    q = (
        db.query(AttendanceRecord, User)
        .join(User, User.id == AttendanceRecord.user_id)
        .filter(User.is_deleted == False)  # noqa: E712
    )
    if department_id:
        q = q.filter(User.department_id == department_id)
    if employee_id:
        q = q.filter(AttendanceRecord.user_id == employee_id)
    if from_date:
        q = q.filter(AttendanceRecord.attendance_date >= from_date)
    if to_date:
        q = q.filter(AttendanceRecord.attendance_date <= to_date)
    if work_mode:
        q = q.filter(AttendanceRecord.work_mode == work_mode)

    rows = q.order_by(AttendanceRecord.attendance_date.desc()).limit(5000).all()
    data = [_to_out(rec, user.full_name) for rec, user in rows]

    if export == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "employee_name",
                "date",
                "work_mode",
                "check_in",
                "check_out",
                "minutes_worked",
                "overtime",
                "status",
            ]
        )
        for item in data:
            writer.writerow(
                [
                    item.employee_name,
                    item.attendance_date,
                    item.work_mode,
                    item.check_in_time,
                    item.check_out_time,
                    item.total_minutes_worked,
                    item.overtime_minutes,
                    item.status,
                ]
            )
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=attendance_report.csv"},
        )

    return data


@router.put("/{record_id}", response_model=AttendanceOut)
def update_attendance(
    record_id: str,
    body: dict,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    rec = db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")

    old = {"status": rec.status, "work_mode": rec.work_mode, "notes": rec.notes}
    for key in ("work_mode", "status", "notes", "check_in_time", "check_out_time"):
        if key in body and body[key] is not None:
            setattr(rec, key, body[key])
    if rec.check_in_time and rec.check_out_time:
        rec.total_minutes_worked = calculate_worked_minutes(rec.check_in_time, rec.check_out_time)
        user = db.query(User).filter(User.id == rec.user_id).first()
        if user:
            rec.overtime_minutes = calculate_overtime(rec.total_minutes_worked, get_user_shift(db, user))
    rec.updated_at = datetime.utcnow()
    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="AttendanceRecord",
        entity_id=rec.id,
        old_values=old,
        new_values=body,
    )
    db.commit()
    db.refresh(rec)
    return _to_out(rec)
