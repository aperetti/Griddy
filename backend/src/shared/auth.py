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
            cursor.execute("SELECT username, password_hash, salt FROM users WHERE username = ?", (credentials.username,))
            row = cursor.fetchone()
            if row:
                correct_username = row[0]
                stored_hash = row[1]
                stored_salt = row[2]
            conn.close()
    except Exception as e:
        print(f"Error reading users database: {e}")

    # To mitigate timing attacks, we must do the expensive hashing even if the user is not found.
    # We use a dummy salt and compute the hash anyway.
    dummy_salt = b'\x00' * 16

    if correct_username and stored_hash and stored_salt:
        salt_bytes = bytes.fromhex(stored_salt)
        inbound_hash = hashlib.pbkdf2_hmac('sha256', credentials.password.encode('utf8'), salt_bytes, 100000).hex()
        is_correct_username = secrets.compare_digest(
            credentials.username.encode("utf8"), correct_username.encode("utf8")
        )
        is_correct_password = secrets.compare_digest(
            inbound_hash.encode("utf8"), stored_hash.encode("utf8")
        )
        is_authenticated = is_correct_username and is_correct_password
    else:
        # User not found or DB error: compute hash against dummy data to consume time
        hashlib.pbkdf2_hmac('sha256', credentials.password.encode('utf8'), dummy_salt, 100000)
        is_authenticated = False

    if not is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic realm=\"Rules Engine\""},
        )
    return credentials.username
