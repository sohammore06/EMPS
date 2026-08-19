from datetime import date as date_cls
from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.policy import Certification
from app.models.user import User
from app.schemas import (
    CertificationOut,
    CertificationUpdate,
    EmployeeDirectoryItem,
    MessageOut,
    UserProfile,
    UserProfileUpdate,
)
from app.services.audit_service import log_audit
from app.services.user_access import get_visible_user, user_role_names

router = APIRouter(prefix="/users", tags=["users"])
settings = get_settings()


def _profile(user: User, roles: list[str]) -> UserProfile:
    return UserProfile(
        id=user.id,
        employee_code=user.employee_code,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        date_of_birth=user.date_of_birth,
        address=user.address,
        emergency_contact_name=user.emergency_contact_name,
        emergency_contact_phone=user.emergency_contact_phone,
        linkedin_url=user.linkedin_url,
        github_url=user.github_url,
        department_id=user.department_id,
        department_name=user.department.name if user.department else None,
        designation_id=user.designation_id,
        designation_name=user.designation.name if user.designation else None,
        reporting_manager_id=user.reporting_manager_id,
        reporting_manager_name=user.reporting_manager.full_name if user.reporting_manager else None,
        employment_status=user.employment_status,
        date_of_joining=user.date_of_joining,
        work_shift_id=user.work_shift_id,
        roles=roles,
    )


@router.get("/me", response_model=UserProfile)
def get_me(current: Annotated[CurrentUser, Depends(get_current_user)]):
    return _profile(current.user, current.roles)


@router.put("/me", response_model=UserProfile)
def update_me(
    body: UserProfileUpdate,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user = current.user
    old = {
        "phone": user.phone,
        "date_of_birth": str(user.date_of_birth) if user.date_of_birth else None,
        "address": user.address,
    }
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(user, key, value)
    user.updated_at = datetime.utcnow()
    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="User",
        entity_id=user.id,
        old_values=old,
        new_values=data,
    )
    db.commit()
    db.refresh(user)
    return _profile(user, current.roles)


@router.get("/directory", response_model=list[EmployeeDirectoryItem])
def employee_directory(
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN", "MANAGER"))],
    db: Annotated[Session, Depends(get_db)],
    department_id: str | None = None,
    q: str | None = None,
):
    query = db.query(User).filter(User.is_deleted == False)  # noqa: E712
    if not current.has_role("HR", "SUPERADMIN"):
        query = query.filter(User.reporting_manager_id == current.id)
    if department_id:
        query = query.filter(User.department_id == department_id)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            (func.lower(User.first_name).like(like))
            | (func.lower(User.last_name).like(like))
            | (func.lower(User.email).like(like))
            | (func.lower(User.employee_code).like(like))
        )
    users = query.order_by(User.first_name).limit(500).all()
    return [
        EmployeeDirectoryItem(
            id=u.id,
            employee_code=u.employee_code,
            name=u.full_name,
            email=u.email,
            phone=u.phone,
            department=u.department.name if u.department else None,
            designation=u.designation.name if u.designation else None,
            employment_status=u.employment_status,
            date_of_joining=u.date_of_joining,
        )
        for u in users
    ]


@router.get("/me/certifications", response_model=list[CertificationOut])
def my_certifications(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.query(Certification).filter(Certification.user_id == current.id).order_by(Certification.name).all()
    return [CertificationOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/me/certifications", response_model=CertificationOut, status_code=status.HTTP_201_CREATED)
async def create_certification(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    name: str = Form(...),
    issuing_organization: str | None = Form(None),
    issue_date: str | None = Form(None),
    expiry_date: str | None = Form(None),
    credential_id: str | None = Form(None),
    credential_url: str | None = Form(None),
    category_id: str | None = Form(None),
    file: UploadFile | None = File(None),
):
    file_path = None
    if file and file.filename:
        dest_dir = Path(settings.UPLOAD_DIR) / "certifications"
        dest_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{uuid4()}_{file.filename}"
        full = dest_dir / fname
        async with aiofiles.open(full, "wb") as f:
            await f.write(await file.read())
        file_path = str(full)

    def _parse_date(v: str | None):
        if not v:
            return None
        return date_cls.fromisoformat(v)

    cert = Certification(
        id=str(uuid4()),
        user_id=current.id,
        name=name,
        issuing_organization=issuing_organization,
        issue_date=_parse_date(issue_date),
        expiry_date=_parse_date(expiry_date),
        credential_id=credential_id,
        credential_url=credential_url,
        category_id=category_id,
        file_path=file_path,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return CertificationOut.model_validate(cert, from_attributes=True)


@router.put("/me/certifications/{cert_id}", response_model=CertificationOut)
def update_certification(
    cert_id: str,
    body: CertificationUpdate,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    cert = (
        db.query(Certification)
        .filter(Certification.id == cert_id, Certification.user_id == current.id)
        .first()
    )
    if not cert:
        raise HTTPException(status_code=404, detail="Certification not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(cert, key, value)
    cert.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cert)
    return CertificationOut.model_validate(cert, from_attributes=True)


@router.delete("/me/certifications/{cert_id}", response_model=MessageOut)
def delete_certification(
    cert_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    cert = (
        db.query(Certification)
        .filter(Certification.id == cert_id, Certification.user_id == current.id)
        .first()
    )
    if not cert:
        raise HTTPException(status_code=404, detail="Certification not found")
    db.delete(cert)
    db.commit()
    return MessageOut(message="Certification deleted")


@router.get("/{user_id}", response_model=UserProfile)
def get_employee_profile(
    user_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user = get_visible_user(db, current, user_id)
    return _profile(user, user_role_names(user) if user.id != current.id else current.roles)


@router.get("/{user_id}/certifications", response_model=list[CertificationOut])
def employee_certifications(
    user_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user = get_visible_user(db, current, user_id)
    rows = db.query(Certification).filter(Certification.user_id == user.id).order_by(Certification.name).all()
    return [CertificationOut.model_validate(r, from_attributes=True) for r in rows]
