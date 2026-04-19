"""
WebSocket endpoint for real-time deal feed updates.
Clients connect and receive deal_analysis rows as they're scored by Airflow tasks.
"""
import asyncio
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError

from app.core.security import decode_token

router = APIRouter()


class ConnectionManager:
    MAX_CONNECTIONS_PER_USER = 5

    def __init__(self):
        # user_id → list of active WebSocket connections
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        conns = self._connections.get(user_id, [])
        if len(conns) >= self.MAX_CONNECTIONS_PER_USER:
            await ws.close(code=4009, reason="Too many connections")
            return False
        await ws.accept()
        self._connections.setdefault(user_id, []).append(ws)
        return True

    def disconnect(self, user_id: str, ws: WebSocket):
        conns = self._connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast_to_user(self, user_id: str, data: dict[str, Any]):
        dead = []
        for ws in self._connections.get(user_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_all(self, data: dict[str, Any]):
        for user_id in list(self._connections.keys()):
            await self.broadcast_to_user(user_id, data)


manager = ConnectionManager()


@router.websocket("/deals")
async def deals_ws(websocket: WebSocket):
    """
    Connect with: ws://<host>/ws/deals?token=<access_token>
    Receives JSON messages of type:
      { "event": "deal_update", "data": { ...DealAnalysis fields } }
      { "event": "ping" }
    """
    token = websocket.query_params.get("token")
    user_id: str | None = None

    try:
        if token:
            payload = decode_token(token)
            if payload.get("type") == "access":
                user_id = payload.get("sub")
    except JWTError:
        pass

    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    connected = await manager.connect(user_id, websocket)
    if not connected:
        return
    try:
        while True:
            # Keep-alive: echo any message from client, send periodic pings
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if msg == "ping":
                    await websocket.send_json({"event": "pong"})
            except asyncio.TimeoutError:
                await websocket.send_json({"event": "ping"})
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
