"""HRMS schema extensions for EPMS

Revision ID: 001_hrms
Revises:
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_hrms"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return any(c["name"].lower() == column.lower() for c in insp.get_columns(table))


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    names = {t.lower() for t in insp.get_table_names()}
    return table.lower() in names


def upgrade() -> None:
    if not _table_exists("work_shifts"):
        op.create_table(
            "work_shifts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("grace_minutes", sa.Integer(), nullable=False, server_default="15"),
            sa.Column("minimum_hours_for_full_day", sa.Numeric(4, 2), nullable=False, server_default="8"),
        )

    # Extend users
    user_cols = [
        ("date_of_birth", sa.Date()),
        ("work_shift_id", sa.String(36)),
        ("microsoft_oid", sa.String(128)),
        ("is_microsoft_account", sa.Boolean(), True),
        ("last_login_at", sa.DateTime()),
        ("address", sa.Text()),
        ("emergency_contact_name", sa.String(150)),
        ("emergency_contact_phone", sa.String(50)),
        ("linkedin_url", sa.String(500)),
        ("github_url", sa.String(500)),
    ]
    for name, col_type in user_cols:
        if not _column_exists("users", name):
            if name == "is_microsoft_account":
                op.add_column("users", sa.Column(name, col_type, nullable=False, server_default=sa.text("1")))
            else:
                op.add_column("users", sa.Column(name, col_type, nullable=True))

    if not _table_exists("attendance_records"):
        op.create_table(
            "attendance_records",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("attendance_date", sa.Date(), nullable=False),
            sa.Column("work_mode", sa.String(20), nullable=False),
            sa.Column("check_in_time", sa.DateTime(), nullable=True),
            sa.Column("check_out_time", sa.DateTime(), nullable=True),
            sa.Column("total_minutes_worked", sa.Integer(), nullable=True),
            sa.Column("overtime_minutes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(20), nullable=False, server_default="PRESENT"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("GETDATE()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("GETDATE()")),
        )
        op.create_index("ix_attendance_records_user_id", "attendance_records", ["user_id"])
        op.create_index("ix_attendance_records_attendance_date", "attendance_records", ["attendance_date"])

    if not _table_exists("leave_types"):
        op.create_table(
            "leave_types",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("code", sa.String(20), nullable=False, unique=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("GETDATE()")),
        )

    if not _table_exists("employee_leave_balances"):
        op.create_table(
            "employee_leave_balances",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("employee_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("leave_type_id", sa.String(36), sa.ForeignKey("leave_types.id"), nullable=False),
            sa.Column("balance", sa.Numeric(5, 2), nullable=False, server_default="0"),
            sa.Column("last_updated", sa.DateTime(), nullable=False, server_default=sa.text("GETDATE()")),
        )
        op.create_index("ix_employee_leave_balances_employee_id", "employee_leave_balances", ["employee_id"])

    # Extend LeaveRequests
    if _table_exists("LeaveRequests"):
        for name, col in [
            ("is_half_day", sa.Boolean()),
            ("half_day_session", sa.String(20)),
            ("updated_at", sa.DateTime()),
            ("leave_type_id", sa.String(36)),
            ("total_days", sa.Numeric(5, 2)),
        ]:
            if not _column_exists("LeaveRequests", name):
                if name == "is_half_day":
                    op.add_column("LeaveRequests", sa.Column(name, col, server_default=sa.text("0")))
                else:
                    op.add_column("LeaveRequests", sa.Column(name, col, nullable=True))

    if not _table_exists("policies"):
        op.create_table(
            "policies",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("file_name", sa.String(500), nullable=False),
            sa.Column("file_path", sa.String(1000), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("uploaded_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("GETDATE()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("GETDATE()")),
        )


def downgrade() -> None:
    # Non-destructive downgrade intentionally limited
    if _table_exists("policies"):
        op.drop_table("policies")
    if _table_exists("employee_leave_balances"):
        op.drop_table("employee_leave_balances")
    if _table_exists("leave_types"):
        op.drop_table("leave_types")
    if _table_exists("attendance_records"):
        op.drop_table("attendance_records")
    if _table_exists("work_shifts"):
        op.drop_table("work_shifts")
