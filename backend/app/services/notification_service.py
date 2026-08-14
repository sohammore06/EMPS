import logging
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.org import EmailTemplate, Notification, NotificationLog

logger = logging.getLogger(__name__)
settings = get_settings()


class NotificationService:
    def __init__(self, db: Session):
        self.db = db

    async def send_in_app(
        self,
        *,
        user_id: str,
        title: str,
        message: str,
        notification_type: str = "INFO",
        related_entity: str | None = None,
        related_entity_id: str | None = None,
    ) -> Notification:
        note = Notification(
            id=str(uuid4()),
            user_id=user_id,
            title=title,
            message=message,
            type=notification_type,
            is_read=False,
            related_entity=related_entity,
            related_entity_id=related_entity_id,
            created_at=datetime.utcnow(),
        )
        self.db.add(note)
        self.db.flush()
        return note

    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        user_id: str | None = None,
        notification_id: str | None = None,
        template_code: str | None = None,
    ) -> bool:
        if template_code:
            tpl = (
                self.db.query(EmailTemplate)
                .filter(EmailTemplate.code == template_code, EmailTemplate.is_active == True)  # noqa: E712
                .first()
            )
            if tpl:
                subject = tpl.subject
                body = tpl.body

        status = "SENT"
        error: str | None = None

        if not settings.SMTP_HOST:
            logger.info("SMTP not configured; email queued locally to %s: %s", to_email, subject)
            status = "QUEUED_NO_SMTP"
        else:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = settings.SMTP_FROM
                msg["To"] = to_email
                msg.attach(MIMEText(body, "html"))

                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
                    server.starttls()
                    if settings.SMTP_USER:
                        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.sendmail(settings.SMTP_FROM, [to_email], msg.as_string())
            except Exception as exc:
                logger.exception("Failed to send email to %s", to_email)
                status = "FAILED"
                error = str(exc)

        log = NotificationLog(
            id=str(uuid4()),
            notification_id=notification_id,
            user_id=user_id,
            channel="EMAIL",
            recipient=to_email,
            status=status,
            error_message=error,
            sent_at=datetime.utcnow(),
        )
        self.db.add(log)
        self.db.flush()
        return status in ("SENT", "QUEUED_NO_SMTP")

    async def notify_user(
        self,
        *,
        user_id: str,
        email: str,
        title: str,
        message: str,
        notification_type: str = "INFO",
        related_entity: str | None = None,
        related_entity_id: str | None = None,
    ) -> None:
        note = await self.send_in_app(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            related_entity=related_entity,
            related_entity_id=related_entity_id,
        )
        await self.send_email(
            to_email=email,
            subject=title,
            body=f"<p>{message}</p>",
            user_id=user_id,
            notification_id=note.id,
        )
