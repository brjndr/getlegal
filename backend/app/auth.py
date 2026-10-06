"""Accounts: signing up, signing in, and knowing who is making a request.

A signed-in browser holds a random token in a cookie that scripts cannot read. The database keeps
a hash of it, and is emptied on every start, which signs everyone out.
"""

import hashlib
import hmac
import os
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from app import db

COOKIE = "prelegal_session"
SESSION_LENGTH = timedelta(days=30)
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
MIN_PASSWORD = 8
# Hashing is deliberately slow, so the length of what is hashed has a limit.
MAX_PASSWORD = 128
# The cost of hashing a password: scrypt's n, r and p.
SCRYPT = (2**14, 8, 1)


class SignIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=MAX_PASSWORD)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL.fullmatch(email):
            raise ValueError("Enter a valid email address")
        return email


class SignUp(SignIn):
    password: str = Field(min_length=MIN_PASSWORD, max_length=MAX_PASSWORD)


class User(BaseModel):
    id: int
    email: str


def hash_password(password: str, salt: bytes | None = None) -> str:
    """A slow, salted hash of the password, in the form "scrypt$<salt>$<hash>"."""
    salt = salt or secrets.token_bytes(16)
    n, r, p = SCRYPT
    key = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32)
    return f"scrypt${salt.hex()}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt = bytes.fromhex(stored.split("$")[1])
    return hmac.compare_digest(hash_password(password, salt), stored)


# Checked when the email has no account, so that the answer takes as long either way.
NOBODY = hash_password(secrets.token_hex())


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _start_session(response: Response, user: dict) -> User:
    """Signs the browser in as this user."""
    token = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + SESSION_LENGTH
    db.create_session(_hash_token(token), user["id"], expires.isoformat(timespec="seconds"))
    response.set_cookie(
        COOKIE,
        token,
        max_age=int(SESSION_LENGTH.total_seconds()),
        httponly=True,
        # Not sent with requests that other sites make, which is what stops them acting as the user.
        samesite="lax",
        # Set COOKIE_SECURE=1 when serving over HTTPS. Off by default, for http://localhost.
        secure=os.environ.get("COOKIE_SECURE") == "1",
    )
    return User(id=user["id"], email=user["email"])


def current_user(request: Request) -> User:
    """The signed-in user making the request. Answers 401 when there is none."""
    token = request.cookies.get(COOKIE)
    user = db.session_user(_hash_token(token)) if token else None
    if user is None:
        raise HTTPException(401, "Sign in to continue.")
    return User(**user)


CurrentUser = Annotated[User, Depends(current_user)]

router = APIRouter(prefix="/api")


@router.post("/signup", status_code=201)
def sign_up(request: SignUp, response: Response) -> User:
    user = db.create_user(request.email, hash_password(request.password))
    if user is None:
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    return _start_session(response, user)


@router.post("/login")
def sign_in(request: SignIn, response: Response) -> User:
    user = db.find_user(request.email)
    correct = verify_password(request.password, user["password_hash"] if user else NOBODY)
    if user is None or not correct:
        # The same answer for both, so it does not reveal which emails have accounts.
        raise HTTPException(401, "Incorrect email or password.")
    return _start_session(response, user)


@router.post("/logout", status_code=204)
def sign_out(request: Request, response: Response) -> None:
    if token := request.cookies.get(COOKIE):
        db.delete_session(_hash_token(token))
    response.delete_cookie(COOKIE)
