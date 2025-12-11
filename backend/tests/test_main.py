"""Basic tests for the FastAPI application."""
import pytest


@pytest.mark.unit
def test_root_endpoint(client):
    """Test the root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


@pytest.mark.unit
def test_health_endpoint(client):
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.unit
def test_health_llm_endpoint(client):
    """Test the LLM health check endpoint."""
    response = client.get("/health/llm")
    assert response.status_code == 200
    assert "provider" in response.json()
    assert "configured" in response.json()


@pytest.mark.unit
def test_api_docs(client):
    """Test that API documentation is accessible."""
    response = client.get("/docs")
    assert response.status_code == 200


@pytest.mark.unit
def test_openapi_json(client):
    """Test that OpenAPI schema is accessible."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "openapi" in response.json()

