import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_roles
from app.models.policy import Policy
from app.models.user import User
from app.schemas import MessageOut, PolicyOut
from app.services.audit_service import log_audit
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/policies", tags=["policies"])
settings = get_settings()


def _policy_out(p: Policy) -> PolicyOut:
    return PolicyOut(
        id=p.id,
        title=p.title,
        description=p.description,
        file_name=p.file_name,
        version=p.version,
        is_active=p.is_active,
        uploaded_by=p.uploaded_by,
        uploaded_by_name=p.uploader.full_name if p.uploader else None,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get("", response_model=list[PolicyOut])
def list_policies(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    include_inactive: bool = False,
):
    q = db.query(Policy)
    if not include_inactive or not current.has_role("HR", "SUPERADMIN"):
        q = q.filter(Policy.is_active == True)  # noqa: E712
    return [_policy_out(p) for p in q.order_by(Policy.updated_at.desc()).all()]


@router.get("/{policy_id}", response_model=PolicyOut)
def get_policy(
    policy_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    p = db.query(Policy).filter(Policy.id == policy_id).first()
    if not p or (not p.is_active and not current.has_role("HR", "SUPERADMIN")):
        raise HTTPException(status_code=404, detail="Policy not found")
    return _policy_out(p)


@router.get("/{policy_id}/download")
def download_policy(
    policy_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    inline: bool = Query(False, description="If true, open inline in browser instead of download"),
):
    p = db.query(Policy).filter(Policy.id == policy_id).first()
    if not p or (not p.is_active and not current.has_role("HR", "SUPERADMIN")):
        raise HTTPException(status_code=404, detail="Policy not found")
    path = Path(p.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on server")
    media_type = mimetypes.guess_type(p.file_name)[0] or "application/octet-stream"
    return FileResponse(
        path,
        filename=p.file_name,
        media_type=media_type,
        content_disposition_type="inline" if inline else "attachment",
    )


@router.post("", response_model=PolicyOut, status_code=status.HTTP_201_CREATED)
async def create_policy(
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
    title: str = Form(...),
    description: str | None = Form(None),
    file: UploadFile = File(...),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File required")

    dest_dir = Path(settings.UPLOAD_DIR) / "policies"
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4()}_{file.filename}"
    full_path = dest_dir / stored_name
    async with aiofiles.open(full_path, "wb") as f:
        await f.write(await file.read())

    now = datetime.utcnow()
    policy = Policy(
        id=str(uuid4()),
        title=title,
        description=description,
        file_name=file.filename,
        file_path=str(full_path),
        version=1,
        is_active=True,
        uploaded_by=current.id,
        created_at=now,
        updated_at=now,
    )
    db.add(policy)
    db.flush()

    notifier = NotificationService(db)
    # Notify a sample of active employees (cap for practicality)
    employees = db.query(User).filter(User.is_deleted == False).limit(200).all()  # noqa: E712
    for emp in employees:
        await notifier.send_in_app(
            user_id=emp.id,
            title="New HR policy published",
            message=f"A new policy '{title}' is available in the policy portal.",
            notification_type="POLICY",
            related_entity="Policy",
            related_entity_id=policy.id,
        )

    log_audit(
        db,
        user_id=current.id,
        action="CREATE",
        entity="Policy",
        entity_id=policy.id,
        new_values={"title": title, "file_name": file.filename},
    )
    db.commit()
    db.refresh(policy)
    return _policy_out(policy)


@router.put("/{policy_id}", response_model=PolicyOut)
async def update_policy(
    policy_id: str,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
    title: str | None = Form(None),
    description: str | None = Form(None),
    is_active: bool | None = Form(None),
    file: UploadFile | None = File(None),
):
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    old = {"title": policy.title, "version": policy.version, "is_active": policy.is_active}
    if title is not None:
        policy.title = title
    if description is not None:
        policy.description = description
    if is_active is not None:
        policy.is_active = is_active

    if file and file.filename:
        dest_dir = Path(settings.UPLOAD_DIR) / "policies"
        dest_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{uuid4()}_{file.filename}"
        full_path = dest_dir / stored_name
        async with aiofiles.open(full_path, "wb") as f:
            await f.write(await file.read())
        policy.file_name = file.filename
        policy.file_path = str(full_path)
        policy.version += 1
        policy.uploaded_by = current.id

    policy.updated_at = datetime.utcnow()
    log_audit(
        db,
        user_id=current.id,
        action="UPDATE",
        entity="Policy",
        entity_id=policy.id,
        old_values=old,
        new_values={"title": policy.title, "version": policy.version, "is_active": policy.is_active},
    )
    db.commit()
    db.refresh(policy)
    return _policy_out(policy)


@router.delete("/{policy_id}", response_model=MessageOut)
def delete_policy(
    policy_id: str,
    current: Annotated[CurrentUser, Depends(require_roles("HR", "SUPERADMIN"))],
    db: Annotated[Session, Depends(get_db)],
):
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    policy.is_active = False
    policy.updated_at = datetime.utcnow()
    log_audit(db, user_id=current.id, action="DEACTIVATE", entity="Policy", entity_id=policy.id)
    db.commit()
    return MessageOut(message="Policy deactivated")
