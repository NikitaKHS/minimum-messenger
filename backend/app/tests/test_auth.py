import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register(client: AsyncClient, register_payload: dict):
    response = await client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient, register_payload: dict):
    await client.post("/api/v1/auth/register", json=register_payload)
    response = await client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login(client: AsyncClient, register_payload: dict):
    await client.post("/api/v1/auth/register", json=register_payload)
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "username": register_payload["username"],
            "password": register_payload["password"],
            "device_name": "Test Device",
            "device_type": "web",
            "public_identity_key": register_payload["public_identity_key"],
            "public_key_fingerprint": register_payload["public_key_fingerprint"],
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, register_payload: dict):
    await client.post("/api/v1/auth/register", json=register_payload)
    response = await client.post(
        "/api/v1/auth/login",
        json={
            **register_payload,
            "password": "wrong_password",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, register_payload: dict):
    reg = await client.post("/api/v1/auth/register", json=register_payload)
    refresh_token = reg.json()["refresh_token"]

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    new_data = response.json()
    assert "access_token" in new_data
    assert new_data["refresh_token"] != refresh_token  # rotation happened


@pytest.mark.asyncio
async def test_refresh_token_reuse_rejected(client: AsyncClient, register_payload: dict):
    reg = await client.post("/api/v1/auth/register", json=register_payload)
    refresh_token = reg.json()["refresh_token"]

    await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me(client: AsyncClient, register_payload: dict):
    reg = await client.post("/api/v1/auth/register", json=register_payload)
    token = reg.json()["access_token"]

    response = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["username"] == register_payload["username"]
