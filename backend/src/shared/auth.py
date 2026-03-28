import os
import secrets
import sqlite3
import hashlib
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from src.shared.database_setup import ADMIN_SQLITE_PATH

security = HTTPBasic()


def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = None
    stored_hash = None
    stored_salt = None

    try:
        if os.path.exists(ADMIN_SQLITE_PATH):
            conn = sqlite3.connect(ADMIN_SQLITE_PATH)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT username, password_hash, salt FROM users WHERE username = ?",
                (credentials.username,),
            )
            row = cursor.fetchone()
            if row:
                correct_username = row[0]
                stored_hash = row[1]
                stored_salt = row[2]
            conn.close()
    except Exception as e:
        print(f"Error reading users database: {e}")

    # Dummy values for constant-time comparison if user is not found
    dummy_salt = "00000000000000000000000000000000"
    dummy_hash = "0000000000000000000000000000000000000000000000000000000000000000"
    dummy_username = ""

    user_found = (
        (correct_username is not None)
        and (stored_hash is not None)
        and (stored_salt is not None)
    )

    salt_to_use = stored_salt if user_found else dummy_salt
    hash_to_use = stored_hash if user_found else dummy_hash
    username_to_use = correct_username if user_found else dummy_username

    # Re-hash the provided password with the stored salt
    salt_bytes = bytes.fromhex(salt_to_use)
    inbound_hash = hashlib.pbkdf2_hmac(
        "sha256", credentials.password.encode("utf8"), salt_bytes, 100000
    ).hex()

    is_correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"), username_to_use.encode("utf8")
    )
    is_correct_password = secrets.compare_digest(
        inbound_hash.encode("utf8"), hash_to_use.encode("utf8")
    )

    if not (user_found and is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": 'Basic realm="Rules Engine"'},
        )
    return credentials.username
