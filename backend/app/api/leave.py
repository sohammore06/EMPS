from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.leave import EmployeeLeaveBalance, LeaveRequest, LeaveType
from app.models.user import User
from app.schemas import (
    LeaveActionRequest,
    LeaveApplyRequest,
    LeaveBalanceOut,
    LeaveRequestOut,
    LeaveTypeCreate,
    LeaveTypeOut,
    LeaveTypeUpdate,
    MessageOut,
)
from app.services.audit_service import log_audit
from app.services.notification_service import NotificationService
from app.utils.helpers import leave_days

router = APIRouter(prefix="/leave", tags=["leave"])


def _leave_out(req: LeaveRequest) -> LeaveRequestOut:
    lt = req.leave_type_rel
    return LeaveRequestOut(
        id=req.id,
        employee_id=req.employee_id,
        employee_name=req.employee.full_name if req.employee else None,
        leave_type_id=req.leave_type_id,
        leave_type_code=lt.code if lt else req.leave_type,
        leave_type_name=lt.name if lt else req.leave_type,
        from_date=req.from_date,
        to_date=req.to_date,
        is_half_day=req.is_half_day,
        half_day_session=req.half_day_session,
        reason=req.reason,
        status=req.status,
        total_days=req.total_days,
        rejection_reason=req.rejection_reason,
        created_at=req.created_at,
    )


# ---------- Leave Types (HR) ----------


@router.get("/types", response_model=list[LeaveTypeOut])
def list_leave_types(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    active_only: bool = True,
):
    q = db.query(LeaveType)
    if active_only and not current.has_role("HR", "SUPERADMIN"):
        q = q.filter(LeaveType.is_active == True)  # noqa: E712
    return [LeaveTypeOut.model_validate(t, from_attributes=True) for t in q.order_by(LeaveType.code).all()]


@router.post("/types", response_model=LeaveTypeOut, status_code=status.HTTP_201_CREATED)
def create_leave_type(
    body: LeaveTypeCreate,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    if db.query(LeaveType).filter(LeaveType.code == body.code.upper()).first():
        raise HTTPException(status_code=400, detail="Leave type code already exists")
    lt = LeaveType(
        id=str(uuid4()),
        code=body.code.upper(),
        name=body.name,
        is_active=body.is_active,
        created_at=datetime.utcnow(),
    )
    db.add(lt)
    log_audit(db, user_id=current.id, action="CREATE", entity="LeaveType", entity_id=lt.id, new_values=body.model_dump())
    db.commit()
    db.refresh(lt)
    return LeaveTypeOut.model_validate(lt, from_attributes=True)


@router.put("/types/{type_id}", response_model=LeaveTypeOut)
def update_leave_type(
    type_id: str,
    body: LeaveTypeUpdate,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    lt = db.query(LeaveType).filter(LeaveType.id == type_id).first()
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    old = {"code": lt.code, "name": lt.name, "is_active": lt.is_active}
    data = body.model_dump(exclude_unset=True)
    if "code" in data and data["code"]:
        data["code"] = data["code"].upper()
    for k, v in data.items():
        setattr(lt, k, v)
    log_audit(db, user_id=current.id, action="UPDATE", entity="LeaveType", entity_id=lt.id, old_values=old, new_values=data)
    db.commit()
    db.refresh(lt)
    return LeaveTypeOut.model_validate(lt, from_attributes=True)


@router.delete("/types/{type_id}", response_model=MessageOut)
def delete_leave_type(
    type_id: str,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    lt = db.query(LeaveType).filter(LeaveType.id == type_id).first()
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    lt.is_active = False
    log_audit(db, user_id=current.id, action="DEACTIVATE", entity="LeaveType", entity_id=lt.id)
    db.commit()
    return MessageOut(message="Leave type deactivated")


# ---------- Balances & Apply ----------


@router.get("/balance", response_model=list[LeaveBalanceOut])
def my_balance(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = (
        db.query(EmployeeLeaveBalance)
        .filter(EmployeeLeaveBalance.employee_id == current.id)
        .all()
    )
    return [
        LeaveBalanceOut(
            leave_type_id=r.leave_type_id,
            leave_type_code=r.leave_type.code if r.leave_type else "",
            leave_type_name=r.leave_type.name if r.leave_type else "",
            balance=r.balance,
        )
        for r in rows
    ]


@router.get("/my", response_model=list[LeaveRequestOut])
def my_leaves(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.employee_id == current.id)
        .order_by(LeaveRequest.created_at.desc())
        .all()
    )
    return [_leave_out(r) for r in rows]


@router.post("/apply", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
async def apply_leave(
    body: LeaveApplyRequest,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.to_date < body.from_date:
        raise HTTPException(status_code=400, detail="to_date must be on or after from_date")
    if body.is_half_day and body.from_date != body.to_date:
        raise HTTPException(status_code=400, detail="Half-day leave must be for a single date")
    if body.is_half_day and not body.half_day_session:
        raise HTTPException(status_code=400, detail="half_day_session is required for half-day leave")

    lt = db.query(LeaveType).filter(LeaveType.id == body.leave_type_id, LeaveType.is_active == True).first()  # noqa: E712
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")

    overlap = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.employee_id == current.id,
            LeaveRequest.status.in_(["PENDING", "APPROVED"]),
            or_(
                and_(LeaveRequest.from_date <= body.to_date, LeaveRequest.to_date >= body.from_date),
            ),
        )
        .first()
    )
    if overlap:
        raise HTTPException(status_code=400, detail="Overlapping leave request exists")

    days = leave_days(body.from_date, body.to_date, body.is_half_day)
    if lt.code != "LOP":
        bal = (
            db.query(EmployeeLeaveBalance)
            .filter(
                EmployeeLeaveBalance.employee_id == current.id,
                EmployeeLeaveBalance.leave_type_id == body.leave_type_id,
            )
            .first()
        )
        if not bal or bal.balance < days:
            raise HTTPException(status_code=400, detail="Insufficient leave balance")

    req = LeaveRequest(
        id=str(uuid4()),
        employee_id=current.id,
        leave_type_id=body.leave_type_id,
        leave_type=lt.code,
        from_date=body.from_date,
        to_date=body.to_date,
        reason=body.reason,
        status="PENDING",
        total_days=days,
        is_half_day=body.is_half_day,
        half_day_session=body.half_day_session if body.is_half_day else None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(req)
    db.flush()

    notifier = NotificationService(db)
    manager_id = current.user.reporting_manager_id
    if manager_id:
        manager = db.query(User).filter(User.id == manager_id).first()
        if manager:
            await notifier.notify_user(
                user_id=manager.id,
                email=manager.email,
                title="New leave request",
                message=f"{current.user.full_name} applied for {days} day(s) of {lt.name} leave ({body.from_date} to {body.to_date}).",
                notification_type="LEAVE",
                related_entity="LeaveRequest",
                related_entity_id=req.id,
            )

    log_audit(
        db,
        user_id=current.id,
        action="APPLY",
        entity="LeaveRequest",
        entity_id=req.id,
        new_values=body.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(req)
    return _leave_out(req)


@router.get("/pending", response_model=list[LeaveRequestOut])
def pending_leaves(
    current: Annotated[CurrentUser, Depends(require_roles("MANAGER", "HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    q = db.query(LeaveRequest).filter(LeaveRequest.status == "PENDING")
    if not current.has_role("HR", "SUPERADMIN"):
        team_ids = [
            u.id
            for u in db.query(User)
            .filter(User.reporting_manager_id == current.id, User.is_deleted == False)  # noqa: E712
            .all()
        ]
        if not team_ids:
            return []
        q = q.filter(LeaveRequest.employee_id.in_(team_ids))
    rows = q.order_by(LeaveRequest.created_at).all()
    return [_leave_out(r) for r in rows]


@router.post("/{request_id}/approve", response_model=LeaveRequestOut)
async def approve_leave(
    request_id: str,
    current: Annotated[CurrentUser, Depends(require_roles("MANAGER", "HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Leave request is not pending")

    if not current.has_role("HR", "SUPERADMIN"):
        emp = db.query(User).filter(User.id == req.employee_id).first()
        if not emp or emp.reporting_manager_id != current.id:
            raise HTTPException(status_code=403, detail="Not authorized to approve this request")

    old_status = req.status
    req.status = "APPROVED"
    req.approved_by = current.id
    req.approved_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()

    days = req.total_days or Decimal("0")
    lt = req.leave_type_rel
    if lt and lt.code != "LOP" and days > 0:
        bal = (
            db.query(EmployeeLeaveBalance)
            .filter(
                EmployeeLeaveBalance.employee_id == req.employee_id,
                EmployeeLeaveBalance.leave_type_id == req.leave_type_id,
            )
            .first()
        )
        if bal:
            bal.balance = Decimal(str(bal.balance)) - Decimal(str(days))
            bal.last_updated = datetime.utcnow()

    employee = req.employee
    if employee:
        notifier = NotificationService(db)
        await notifier.notify_user(
            user_id=employee.id,
            email=employee.email,
            title="Leave approved",
            message=f"Your leave request from {req.from_date} to {req.to_date} has been approved.",
            notification_type="LEAVE",
            related_entity="LeaveRequest",
            related_entity_id=req.id,
        )

    log_audit(
        db,
        user_id=current.id,
        action="APPROVE",
        entity="LeaveRequest",
        entity_id=req.id,
        old_values={"status": old_status},
        new_values={"status": "APPROVED"},
    )
    db.commit()
    db.refresh(req)
    return _leave_out(req)


@router.post("/{request_id}/reject", response_model=LeaveRequestOut)
async def reject_leave(
    request_id: str,
    body: LeaveActionRequest,
    current: Annotated[CurrentUser, Depends(require_roles("MANAGER", "HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Leave request is not pending")

    if not current.has_role("HR", "SUPERADMIN"):
        emp = db.query(User).filter(User.id == req.employee_id).first()
        if not emp or emp.reporting_manager_id != current.id:
            raise HTTPException(status_code=403, detail="Not authorized to reject this request")

    old_status = req.status
    req.status = "REJECTED"
    req.approved_by = current.id
    req.approved_at = datetime.utcnow()
    req.rejection_reason = body.rejection_reason
    req.updated_at = datetime.utcnow()

    employee = req.employee
    if employee:
        notifier = NotificationService(db)
        reason = body.rejection_reason or "No reason provided"
        await notifier.notify_user(
            user_id=employee.id,
            email=employee.email,
            title="Leave rejected",
            message=f"Your leave request from {req.from_date} to {req.to_date} was rejected. Reason: {reason}",
            notification_type="LEAVE",
            related_entity="LeaveRequest",
            related_entity_id=req.id,
        )

    log_audit(
        db,
        user_id=current.id,
        action="REJECT",
        entity="LeaveRequest",
        entity_id=req.id,
        old_values={"status": old_status},
        new_values={"status": "REJECTED", "reason": body.rejection_reason},
    )
    db.commit()
    db.refresh(req)
    return _leave_out(req)
