import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.org import AuditLog


def log_audit(
    db: Session,
    *,
    user_id: str | None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    old_values: Any = None,
    new_values: Any = None,
    ip_address: str | None = None,
) -> None:
    def _serialize(val: Any) -> str | None:
        if val is None:
            return None
        if isinstance(val, str):
            return val
        return json.dumps(val, default=str)

    entry = AuditLog(
        id=str(uuid4()),
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        old_values=_serialize(old_values),
        new_values=_serialize(new_values),
        ip_address=ip_address,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.flush()
