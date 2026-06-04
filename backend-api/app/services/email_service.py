"""
Email service for Lehkhabu API.

When SMTP_HOST is configured, emails are sent via SMTP with STARTTLS.
When SMTP_HOST is empty (local development / CI), messages are printed to the
console logger so that developers can still exercise the full auth flow
without needing a real mail server.

HTML templates are intentionally minimal so they render correctly in all
major email clients and cannot be trivially exploited for XSS via
injected user-controlled values (which are HTML-escaped).
"""

import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _html_escape(value: str) -> str:
    """Escape user-supplied values before embedding in HTML email bodies."""
    return html.escape(value, quote=True)


def _build_message(to: str, subject: str, html_body: str) -> MIMEMultipart:
    from_header = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_header
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


async def _send(to: str, subject: str, html_body: str) -> None:
    """Send an email or log to console in dev mode."""
    if not settings.SMTP_HOST:
        # Dev / CI fallback — no SMTP configured
        logger.info(
            "\n"
            "═══════════════════════════════════════════════════\n"
            " [EMAIL — DEV MODE]\n"
            " To      : %s\n"
            " Subject : %s\n"
            "───────────────────────────────────────────────────\n"
            "%s\n"
            "═══════════════════════════════════════════════════",
            to, subject, html_body,
        )
        return

    msg = _build_message(to, subject, html_body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        server.ehlo()
        if settings.SMTP_TLS:
            server.starttls()
            server.ehlo()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM_EMAIL, to, msg.as_string())
        logger.info("Email sent to %s: %s", to, subject)


# ── Public senders ────────────────────────────────────────────────────────────

async def send_verification_email(email: str, full_name: str, raw_token: str) -> None:
    """Send the email-verification link to a newly registered user."""
    safe_name = _html_escape(full_name)
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
    expires_h = settings.EMAIL_VERIFICATION_EXPIRE_HOURS

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f9f6f0;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
              padding:40px;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <h2 style="color:#2d2d2d;margin-top:0;">Welcome to Lehkhabu, {safe_name}! 📚</h2>
    <p style="color:#555;line-height:1.6;">
      Please verify your email address to activate your account and start
      exploring our library.
    </p>
    <a href="{verify_url}"
       style="display:inline-block;margin:24px 0;padding:14px 28px;
              background:#6d4c41;color:#fff;border-radius:8px;
              text-decoration:none;font-weight:bold;font-size:15px;">
      Verify Email Address
    </a>
    <p style="color:#888;font-size:13px;">
      This link expires in <strong>{expires_h} hours</strong> and can only be
      used once. If you did not create an account, you can safely ignore this
      email.
    </p>
  </div>
</body>
</html>
"""
    await _send(email, "Verify your Lehkhabu account", html_body)


async def send_password_reset_email(email: str, full_name: str, raw_token: str) -> None:
    """Send a time-limited, single-use password-reset link."""
    safe_name = _html_escape(full_name)
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
    expires_m = settings.PASSWORD_RESET_EXPIRE_MINUTES

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f9f6f0;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
              padding:40px;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <h2 style="color:#2d2d2d;margin-top:0;">Password Reset Request</h2>
    <p style="color:#555;line-height:1.6;">
      Hi <strong>{safe_name}</strong>, we received a request to reset the
      password on your Lehkhabu account.
    </p>
    <a href="{reset_url}"
       style="display:inline-block;margin:24px 0;padding:14px 28px;
              background:#6d4c41;color:#fff;border-radius:8px;
              text-decoration:none;font-weight:bold;font-size:15px;">
      Reset My Password
    </a>
    <p style="color:#888;font-size:13px;">
      This link expires in <strong>{expires_m} minutes</strong> and can only be
      used <strong>once</strong>. If you did not request a password reset,
      please ignore this email — your password will not change.
    </p>
  </div>
</body>
</html>
"""
    await _send(email, "Reset your Lehkhabu password", html_body)
