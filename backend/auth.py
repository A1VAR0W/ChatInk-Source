import os
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password:str) -> str:
    return pwd_context.hash(password)

def verify_password(password:str, password_hash:str) -> bool:
    return pwd_context.verify(password,password_hash)

def create_access_token(user_id: int) -> str:
    secret = os.getenv("JWT_SECRET")
    alg = os.getenv("JWT_ALGORITHM", "HS256")
    expires_min = int(os.getenv("JWT_EXPIRES_MIN", "60"))

    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expires_min),
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(payload, secret, algorithm=alg)
