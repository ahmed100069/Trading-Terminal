from __future__ import annotations

import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.alert_event import AlertEvent


class AlertService:
    def create_alert(
        self,
        db: Session,
        symbol: str,
        strategy_name: str,
        message: str,
    ) -> AlertEvent:
        channel = "email" if settings.alert_mode == "email" else "console"
        alert = AlertEvent(
            symbol=symbol,
            strategy_name=strategy_name,
            channel=channel,
            message=message,
        )
        db.add(alert)
        self._dispatch(message)
        return alert

    def _dispatch(self, message: str) -> None:
        if settings.alert_mode in {"console", "both"}:
            print(f"[ALERT] {message}")

        if settings.alert_mode in {"email", "both"}:
            self._send_email(message)

    def _send_email(self, message: str) -> None:
        required_fields = [
            settings.smtp_host,
            settings.smtp_username,
            settings.smtp_password,
            settings.alert_email_from,
            settings.alert_email_to,
        ]

        if not all(required_fields):
            print("[ALERT] Email settings are incomplete, so the alert was only logged locally.")
            return

        email_message = EmailMessage()
        email_message["Subject"] = "Weekly Trading Platform Alert"
        email_message["From"] = settings.alert_email_from
        email_message["To"] = settings.alert_email_to
        email_message.set_content(message)

        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(email_message)
        except OSError as exc:
            print(f"[ALERT] Email delivery failed: {exc}")
