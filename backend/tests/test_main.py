from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    # Depending on whether the frontend dist directory exists, it returns different content
    if response.headers.get("content-type") == "application/json":
        assert response.json() == {"message": "API is running. UI building not found. Run Vite dev server for frontend."}
    else:
        # It's returning the static files, should be text/html
        assert "text/html" in response.headers.get("content-type", "")

def test_read_docs():
    response = client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")

def test_cors_headers():
    # Test CORS middleware is applied
    response = client.options(
        "/",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "GET" in response.headers.get("access-control-allow-methods", "")
