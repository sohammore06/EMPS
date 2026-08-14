from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "AuthUser"


class AuthUser(BaseModel):
    id: str
    name: str
    email: EmailStr
    roles: list[str]
    employee_code: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None


class MicrosoftLoginRequest(BaseModel):
    id_token: str


class LocalLoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserProfile(BaseModel):
    id: str
    employee_code: Optional[str] = None
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation_id: Optional[str] = None
    designation_name: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    reporting_manager_name: Optional[str] = None
    employment_status: Optional[str] = None
    date_of_joining: Optional[date] = None
    work_shift_id: Optional[str] = None
    roles: list[str] = []


class UserProfileUpdate(BaseModel):
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None


class EmployeeDirectoryItem(BaseModel):
    id: str
    employee_code: Optional[str] = None
    name: str
    email: EmailStr
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    employment_status: Optional[str] = None
    date_of_joining: Optional[date] = None


class CheckInRequest(BaseModel):
    work_mode: str = Field(..., pattern="^(OFFICE|WFH)$")
    notes: Optional[str] = None


class CheckOutRequest(BaseModel):
    notes: Optional[str] = None


class AttendanceOut(BaseModel):
    id: str
    user_id: str
    attendance_date: date
    work_mode: str
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    total_minutes_worked: Optional[int] = None
    overtime_minutes: int = 0
    status: str
    notes: Optional[str] = None
    employee_name: Optional[str] = None


class AttendanceSummary(BaseModel):
    records: list[AttendanceOut]
    total_worked_minutes: int
    total_overtime_minutes: int
    present_count: int
    wfh_count: int
    leave_count: int


class LeaveTypeCreate(BaseModel):
    code: str
    name: str
    is_active: bool = True


class LeaveTypeUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None


class LeaveTypeOut(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool


class LeaveBalanceOut(BaseModel):
    leave_type_id: str
    leave_type_code: str
    leave_type_name: str
    balance: Decimal


class LeaveApplyRequest(BaseModel):
    leave_type_id: str
    from_date: date
    to_date: date
    is_half_day: bool = False
    half_day_session: Optional[str] = Field(None, pattern="^(FIRST_HALF|SECOND_HALF)$")
    reason: str


class LeaveActionRequest(BaseModel):
    rejection_reason: Optional[str] = None


class LeaveRequestOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    leave_type_id: Optional[str] = None
    leave_type_code: Optional[str] = None
    leave_type_name: Optional[str] = None
    from_date: date
    to_date: date
    is_half_day: Optional[bool] = False
    half_day_session: Optional[str] = None
    reason: Optional[str] = None
    status: str
    total_days: Optional[Decimal] = None
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None


class BirthdayOut(BaseModel):
    id: str
    name: str
    email: str
    department: Optional[str] = None
    designation: Optional[str] = None
    date_of_birth: date
    birthday_this_year: date


class PolicyOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    file_name: str
    version: int
    is_active: bool
    uploaded_by: Optional[str] = None
    uploaded_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PolicyCreate(BaseModel):
    title: str
    description: Optional[str] = None


class CertificationOut(BaseModel):
    id: str
    name: str
    issuing_organization: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    file_path: Optional[str] = None
    category_id: Optional[str] = None


class CertificationCreate(BaseModel):
    name: str
    issuing_organization: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    category_id: Optional[str] = None


class CertificationUpdate(BaseModel):
    name: Optional[str] = None
    issuing_organization: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    category_id: Optional[str] = None


class HRDashboard(BaseModel):
    total_employees: int
    present_today: int
    wfh_today: int
    employees_on_leave_today: int
    today_birthdays: int
    pending_leave_requests: int


class ManagerDashboard(BaseModel):
    team_size: int
    present_today: int
    wfh_today: int
    on_leave_today: int
    pending_leave_requests: int


class EmployeeDashboard(BaseModel):
    checked_in_today: bool
    checked_out_today: bool
    today_work_mode: Optional[str] = None
    leave_balance_total: Decimal
    pending_leaves: int
    upcoming_birthdays: int
    month_worked_minutes: int


class NotificationOut(BaseModel):
    id: str
    title: str
    message: Optional[str] = None
    type: Optional[str] = None
    is_read: bool
    created_at: Optional[datetime] = None


class MessageOut(BaseModel):
    message: str
