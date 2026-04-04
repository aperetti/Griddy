import pytest
from fastapi.testclient import TestClient
from main import app
import sqlite3
import os

client = TestClient(app)

def get_auth_header():
    import base64
    auth_str = "admin:admin" # Default mock auth
    auth_bytes = auth_str.encode('ascii')
    base64_bytes = base64.b64encode(auth_bytes)
    return {"Authorization": f"Basic {base64_bytes.decode('ascii')}"}

def test_update_display_config():
    # 1. Create a config
    resp = client.post("/api/display-rules/configs", json={"name": "Test Config To Update"}, headers=get_auth_header())
    assert resp.status_code == 200
    config_id = resp.json()["id"]
    
    # 2. Update it
    update_resp = client.put(
        f"/api/display-rules/configs/{config_id}", 
        json={"name": "Renamed Config", "description": "New Description"}, 
        headers=get_auth_header()
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Renamed Config"
    assert update_resp.json()["description"] == "New Description"
    
    # 3. Verify in list
    list_resp = client.get("/api/display-rules/configs", headers=get_auth_header())
    configs = list_resp.json()
    updated = next(c for c in configs if c["id"] == config_id)
    assert updated["name"] == "Renamed Config"
    assert updated["description"] == "New Description"

def test_update_display_config_invalid_id():
    resp = client.put(
        "/api/display-rules/configs/999999", 
        json={"name": "Fail"}, 
        headers=get_auth_header()
    )
    assert resp.status_code == 404
