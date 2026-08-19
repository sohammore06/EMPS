"""Standardized skills catalog and employee skills

Revision ID: 002_skills
Revises: 001_hrms
Create Date: 2026-08-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_skills"
down_revision: Union[str, None] = "001_hrms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    names = {t.lower() for t in insp.get_table_names()}
    return table.lower() in names


def upgrade() -> None:
    if not _table_exists("skills"):
        op.create_table(
            "skills",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(150), nullable=False, unique=True),
            sa.Column("category", sa.String(100), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        )
    if not _table_exists("user_skills"):
        op.create_table(
            "user_skills",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("skill_id", sa.String(36), sa.ForeignKey("skills.id"), nullable=False),
            sa.Column("proficiency", sa.String(30), nullable=False, server_default="INTERMEDIATE"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("user_id", "skill_id", name="uq_user_skills_user_skill"),
        )


def downgrade() -> None:
    if _table_exists("user_skills"):
        op.drop_table("user_skills")
    if _table_exists("skills"):
        op.drop_table("skills")
