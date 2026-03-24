import csv
import os
import secrets
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic()

# Path assuming docker /app working directory or local running
CSV_PATH = os.environ.get("AUTH_CSV_PATH", "/app/users.csv")
if not os.path.exists(CSV_PATH):
    # fallback for local development without docker
    alt_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "users.csv")
    if os.path.exists(alt_path):
         CSV_PATH = alt_path
    else:
         alt_path_example = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "users.csv.example")
         if os.path.exists(alt_path_example):
             CSV_PATH = alt_path_example

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = None
    correct_password = None
    
    if os.path.exists(CSV_PATH):
        try:
            with open(CSV_PATH, mode='r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get("username") == credentials.username:
                        correct_username = row.get("username")
                        correct_password = row.get("password")
                        break
        except Exception as e:
            print(f"Error reading auth CSV: {e}")

    if not correct_username or not correct_password:
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic realm=\"Rules Engine\""},
        )

    is_correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"), correct_username.encode("utf8")
    )
    is_correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"), correct_password.encode("utf8")
    )
    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic realm=\"Rules Engine\""},
        )
    return credentials.username
