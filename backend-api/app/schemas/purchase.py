"""
Strict Pydantic schemas for purchases, payment verification, and related models.

Security notes:
  - Currency is validated against an explicit allowlist (no freeform strings).
  - Razorpay IDs are validated for pattern and max length.
  - Amount is read from the book record server-side; it is NEVER accepted from
    the client to prevent price-tampering attacks.
  - PaymentVerification fields are length-bounded to prevent signature-stuffing.
"""

import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


_ALLOWED_CURRENCIES = {"INR", "USD", "GBP", "EUR"}
_RAZORPAY_ORDER_RE = re.compile(r"^order_[A-Za-z0-9]{14,}$")
_RAZORPAY_PAYMENT_RE = re.compile(r"^pay_[A-Za-z0-9]{14,}$")
_RAZORPAY_SIG_RE = re.compile(r"^[a-f0-9]{64}$")  # HMAC-SHA256 hex digest


class PurchaseCreate(BaseModel):
    """Only the book ID is accepted from the client; amount is set server-side."""
    book_id: uuid.UUID


class PurchaseOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    book_id: Optional[uuid.UUID] = None
    amount: float
    currency: str
    status: str
    razorpay_order_id: Optional[str] = None
    # Payment ID is intentionally included so clients can confirm payment status.
    razorpay_payment_id: Optional[str] = None
    purchased_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RazorpayOrderCreate(BaseModel):
    book_id: uuid.UUID


class RazorpayOrderOut(BaseModel):
    id: str
    amount: int          # Amount in paise (smallest unit)
    currency: str


class PaymentVerification(BaseModel):
    """
    All three Razorpay fields are required and pattern-validated.
    This prevents injection or manipulation of the HMAC verification step.
    """
    razorpay_order_id: str = Field(..., min_length=10, max_length=100)
    razorpay_payment_id: str = Field(..., min_length=10, max_length=100)
    razorpay_signature: str = Field(..., min_length=64, max_length=128)

    @field_validator("razorpay_order_id")
    @classmethod
    def validate_order_id(cls, v: str) -> str:
        if not _RAZORPAY_ORDER_RE.match(v):
            raise ValueError("Invalid Razorpay order ID format.")
        return v

    @field_validator("razorpay_payment_id")
    @classmethod
    def validate_payment_id(cls, v: str) -> str:
        if not _RAZORPAY_PAYMENT_RE.match(v):
            raise ValueError("Invalid Razorpay payment ID format.")
        return v

    @field_validator("razorpay_signature")
    @classmethod
    def validate_signature(cls, v: str) -> str:
        if not _RAZORPAY_SIG_RE.match(v):
            raise ValueError(
                "Invalid Razorpay signature format (expected 64-char hex digest)."
            )
        return v
