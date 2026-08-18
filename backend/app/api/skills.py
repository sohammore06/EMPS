from datetime import datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.models.skill import Skill, UserSkill
from app.schemas import MessageOut, SkillOut, UserSkillBulkCreate, UserSkillCreate, UserSkillOut, UserSkillUpdate
from app.services.user_access import get_visible_user

router = APIRouter(tags=["skills"])

PROFICIENCIES = {"BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"}


def _normalize_name(name: str) -> str:
    return " ".join(name.split()).strip()


def _find_or_create_custom_skill(db: Session, custom_name: str) -> Skill:
    name = _normalize_name(custom_name)
    if not name:
        raise HTTPException(status_code=400, detail="Enter a skill name for Other")
    existing = db.query(Skill).filter(func.lower(Skill.name) == name.lower()).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
        return existing
    skill = Skill(id=str(uuid4()), name=name, category="Other", is_active=True)
    db.add(skill)
    db.flush()
    return skill


def _resolve_skill(db: Session, skill_id: str | None, custom_name: str | None) -> Skill:
    if custom_name and custom_name.strip():
        return _find_or_create_custom_skill(db, custom_name)
    if not skill_id:
        raise HTTPException(status_code=400, detail="Select a skill or enter one under Other")
    skill = db.query(Skill).filter(Skill.id == skill_id, Skill.is_active == True).first()  # noqa: E712
    if not skill:
        raise HTTPException(status_code=404, detail="Skill is not available")
    return skill


def _attach_skill(db: Session, user_id: str, skill: Skill, proficiency: str) -> UserSkill:
    exists = db.query(UserSkill).filter(UserSkill.user_id == user_id, UserSkill.skill_id == skill.id).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"{skill.name} is already on your profile")
    row = UserSkill(
        id=str(uuid4()),
        user_id=user_id,
        skill_id=skill.id,
        proficiency=proficiency,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    row.skill = skill
    db.add(row)
    db.flush()
    return row


def _user_skill_out(row: UserSkill) -> UserSkillOut:
    return UserSkillOut(
        id=row.id,
        skill_id=row.skill_id,
        skill_name=row.skill.name if row.skill else "",
        skill_category=row.skill.category if row.skill else None,
        proficiency=row.proficiency,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/skills", response_model=list[SkillOut])
def list_skills(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    active_only: bool = True,
):
    query = db.query(Skill)
    if active_only:
        query = query.filter(Skill.is_active == True)  # noqa: E712
    rows = query.order_by(Skill.category, Skill.name).all()
    return [SkillOut.model_validate(row, from_attributes=True) for row in rows]


@router.get("/users/me/skills", response_model=list[UserSkillOut])
def my_skills(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = (
        db.query(UserSkill)
        .filter(UserSkill.user_id == current.id)
        .order_by(UserSkill.created_at.desc())
        .all()
    )
    return [_user_skill_out(row) for row in rows]


@router.get("/users/{user_id}/skills", response_model=list[UserSkillOut])
def employee_skills(
    user_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user = get_visible_user(db, current, user_id)
    rows = (
        db.query(UserSkill)
        .filter(UserSkill.user_id == user.id)
        .order_by(UserSkill.created_at.desc())
        .all()
    )
    return [_user_skill_out(row) for row in rows]


@router.post("/users/me/skills", response_model=UserSkillOut, status_code=status.HTTP_201_CREATED)
def add_my_skill(
    body: UserSkillCreate,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = _resolve_skill(db, body.skill_id, body.custom_name)
    row = _attach_skill(db, current.id, skill, body.proficiency)
    db.commit()
    db.refresh(row)
    return _user_skill_out(row)


@router.post("/users/me/skills/bulk", response_model=list[UserSkillOut], status_code=status.HTTP_201_CREATED)
def add_my_skills_bulk(
    body: UserSkillBulkCreate,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    custom_names = [_normalize_name(name) for name in body.custom_names if _normalize_name(name)]
    if not body.skill_ids and not custom_names:
        raise HTTPException(status_code=400, detail="Select at least one skill")

    created: list[UserSkill] = []
    seen_skill_ids: set[str] = set()
    seen_custom: set[str] = set()

    def add_unique(skill: Skill) -> None:
        if skill.id in seen_skill_ids:
            return
        seen_skill_ids.add(skill.id)
        exists = (
            db.query(UserSkill)
            .filter(UserSkill.user_id == current.id, UserSkill.skill_id == skill.id)
            .first()
        )
        if exists:
            return
        created.append(_attach_skill(db, current.id, skill, body.proficiency))

    for skill_id in body.skill_ids:
        add_unique(_resolve_skill(db, skill_id, None))
    for name in custom_names:
        key = name.lower()
        if key in seen_custom:
            continue
        seen_custom.add(key)
        add_unique(_find_or_create_custom_skill(db, name))

    if not created:
        raise HTTPException(status_code=400, detail="Those skills are already on your profile")
    db.commit()
    for row in created:
        db.refresh(row)
    return [_user_skill_out(row) for row in created]


@router.put("/users/me/skills/{user_skill_id}", response_model=UserSkillOut)
def update_my_skill(
    user_skill_id: str,
    body: UserSkillUpdate,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    row = (
        db.query(UserSkill)
        .filter(UserSkill.id == user_skill_id, UserSkill.user_id == current.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found on your profile")
    if body.proficiency not in PROFICIENCIES:
        raise HTTPException(status_code=400, detail="Invalid proficiency")
    row.proficiency = body.proficiency
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _user_skill_out(row)


@router.delete("/users/me/skills/{user_skill_id}", response_model=MessageOut)
def delete_my_skill(
    user_skill_id: str,
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    row = (
        db.query(UserSkill)
        .filter(UserSkill.id == user_skill_id, UserSkill.user_id == current.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found on your profile")
    db.delete(row)
    db.commit()
    return MessageOut(message="Skill removed")
