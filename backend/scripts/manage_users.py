#!/usr/bin/env python3
import os
import sys
import argparse
import sqlite3
import hashlib

# Robust project root detection to find database_setup
from pathlib import Path
_THIS_DIR = Path(__file__).resolve().parent
if _THIS_DIR.name == "scripts":
    BASE_DIR = _THIS_DIR.parent # backend/
else:
    BASE_DIR = Path.cwd()

sys.path.insert(0, str(BASE_DIR))

try:
    from src.shared.database_setup import ADMIN_DB_PATH
except ImportError:
    print("Error: Could not import database_setup. Make sure you run this script from the project root or backend directory.")
    sys.exit(1)


def get_db():
    if not os.path.exists(ADMIN_DB_PATH):
        print(f"Error: Admin database not found at {ADMIN_DB_PATH}. Please start the backend to initialize it.")
        sys.exit(1)
    return sqlite3.connect(ADMIN_DB_PATH)



def list_users(args):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, created_at FROM users")
    users = cursor.fetchall()
    conn.close()
    
    if not users:
        print("No users found.")
    else:
        print(f"{'ID':<5} | {'Username':<20} | {'Created At'}")
        print("-" * 50)
        for u in users:
            print(f"{u[0]:<5} | {u[1]:<20} | {u[2]}")


def add_user(args):
    username = args.username
    password = args.password
    
    salt = os.urandom(16)
    password_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf8'), salt, 100000).hex()
    
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        # Update existing user
        cursor.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE username = ?",
            (password_hash, salt.hex(), username)
        )
        print(f"Updated password for user '{username}'.")
    else:
        # Insert new user
        cursor.execute(
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
            (username, password_hash, salt.hex())
        )
        print(f"Created user '{username}'.")
        
    conn.commit()
    conn.close()


def delete_user(args):
    username = args.username
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if not cursor.fetchone():
        print(f"Warning: User '{username}' does not exist.")
    else:
        cursor.execute("DELETE FROM users WHERE username = ?", (username,))
        print(f"Deleted user '{username}'.")
        
    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="Manage Griddy Rules Engine Users via SQLite.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # List command
    subparsers.add_parser("list", help="List all users")
    
    # Add/Update command
    add_parser = subparsers.add_parser("add", help="Add a new user or update an existing password")
    add_parser.add_argument("username", type=str, help="The username")
    add_parser.add_argument("password", type=str, help="The password")
    
    # Delete command
    delete_parser = subparsers.add_parser("delete", help="Delete a user")
    delete_parser.add_argument("username", type=str, help="The username to delete")
    
    args = parser.parse_args()
    
    if args.command == "list":
        list_users(args)
    elif args.command == "add":
        add_user(args)
    elif args.command == "delete":
        delete_user(args)


if __name__ == "__main__":
    main()
