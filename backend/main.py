from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr, Field

from backend.auth import create_access_token, hash_password, verify_password
from backend.db.connection import get_connection

app = FastAPI()


class RegisterIn(BaseModel):
    nombre: str
    correo: EmailStr
    password: str = Field(..., min_length=8, max_length=72)


class LoginIn(BaseModel):
    correo: EmailStr
    password: str = Field(..., min_length=8, max_length=72)


@app.post("/register")
def register(data: RegisterIn):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT 1 FROM usuario WHERE correo=%s OR nombre=%s",
        (data.correo, data.nombre),
    )
    if cur.fetchone():
        cur.close()
        conn.close()
        raise HTTPException(status_code=409, detail="Usuario o correo ya existe")

    pw_hash = hash_password(data.password)
    cur.execute(
        "INSERT INTO usuario (nombre, correo, password_hash) VALUES (%s, %s, %s) RETURNING id_usuario",
        (data.nombre, data.correo, pw_hash),
    )
    user_id = cur.fetchone()[0]
    conn.commit()

    cur.close()
    conn.close()
    return {"id_usuario": user_id}


@app.post("/login")
def login(data: LoginIn):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT id_usuario, password_hash FROM usuario WHERE correo=%s",
        (data.correo,),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    user_id, pw_hash = row
    if not verify_password(data.password, pw_hash):
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    token = create_access_token(user_id)
    return {"access_token": token, "token_type": "bearer"}
