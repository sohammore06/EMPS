from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LeaveType(Base):
    __tablename__ = "leave_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class EmployeeLeaveBalance(Base):
    __tablename__ = "employee_leave_balances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    leave_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("leave_types.id"), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    leave_type = relationship("LeaveType", lazy="joined")


class LeaveRequest(Base):
    """Maps to existing LeaveRequests table with extended columns."""

    __tablename__ = "LeaveRequests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    leave_type_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("leave_types.id"), nullable=True)
    # Some existing schemas use leave_type as string; keep both
    leave_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_days: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Extended
    is_half_day: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    half_day_session: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    employee = relationship("User", foreign_keys=[employee_id], lazy="joined")
    leave_type_rel = relationship("LeaveType", foreign_keys=[leave_type_id], lazy="joined")
