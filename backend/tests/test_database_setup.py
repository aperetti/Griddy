import pytest
import os
import sqlite3
from unittest.mock import patch
from src.shared.database_setup import init_admin_db

def test_init_admin_db_with_env_password(tmp_path):
    admin_db_path = str(tmp_path / "admin.sqlite")
    rules_db_path = str(tmp_path / "rules.sqlite")

    with patch("src.shared.database_setup.ADMIN_DB_PATH", admin_db_path), \
         patch("src.shared.database_setup.RULES_DB_PATH", rules_db_path), \
         patch.dict(os.environ, {"INITIAL_ADMIN_PASSWORD": "mysecretpassword"}):

        init_admin_db()

        conn = sqlite3.connect(admin_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users WHERE username = 'admin'")
        assert cursor.fetchone()[0] == "admin"
        conn.close()

def test_init_admin_db_without_env_password(tmp_path):
    admin_db_path = str(tmp_path / "admin.sqlite")
    rules_db_path = str(tmp_path / "rules.sqlite")

    with patch("src.shared.database_setup.ADMIN_DB_PATH", admin_db_path), \
         patch("src.shared.database_setup.RULES_DB_PATH", rules_db_path), \
         patch.dict(os.environ, {}, clear=True):

        init_admin_db()

        conn = sqlite3.connect(admin_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users WHERE username = 'admin'")
        assert cursor.fetchone()[0] == "admin"
        conn.close()
