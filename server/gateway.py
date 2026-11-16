"""Account-scoped development gateway. Never enable this host runner publicly.

Supabase owns authentication and workspace membership. Each workspace has one
private Runtime process. This adapter does not implement an Agent engine.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import socket
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response, StreamingResponse
from starlette.requests import ClientDisconnect


@dataclass(frozen=True)
class Settings:
    auth_url: str
    public_key: str
    runtime_source: Path
    data_dir: Path
    python: str


@dataclass
class Runtime:
    url: str
    token: str
    process: asyncio.subprocess.Process
    log: object


class Runtimes:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.active: dict[str, Runtime] = {}
        self.lock = asyncio.Lock()

    async def get(self, workspace: str, http: httpx.AsyncClient) -> Runtime:
        async with self.lock:
            current = self.active.get(workspace)
            if current and current.process.returncode is None:
                return current
            if current:
                current.log.close()
                del self.active[workspace]
            root = self.settings.data_dir / workspace
            root.mkdir(parents=True, exist_ok=True, mode=0o700)
            listener = socket.socket()
            listener.bind(('127.0.0.1', 0))
            listener.listen(128)
            port = listener.getsockname()[1]
            token = secrets.token_urlsafe(32)
            env = {key: os.environ[key] for key in ('PATH', 'LANG', 'TMPDIR') if key in os.environ}
            env.update(DEEPSEEK_HOME=str(root / 'home'), HOME=str(root),
                       DEEPSEEK_RUNTIME_TOKEN=token, PYTHONPATH=str(self.settings.runtime_source / 'src'))
            log = (root / 'runtime.log').open('ab')
            os.chmod(root / 'runtime.log', 0o600)
            try:
                process = await asyncio.create_subprocess_exec(
                    self.settings.python, str(Path(__file__).with_name('runner.py')),
                    '--root', str(root), '--fd', str(listener.fileno()),
                    env=env, pass_fds=(listener.fileno(),), stdout=log,
                    stderr=asyncio.subprocess.STDOUT,
                )
            except BaseException:
                log.close()
                raise
            finally:
                listener.close()
            runtime = Runtime(f'http://127.0.0.1:{port}', token, process, log)
            self.active[workspace] = runtime
            for _ in range(100):
                if process.returncode is not None:
                    break
                try:
                    if (await http.get(runtime.url + '/health', timeout=0.5)).is_success:
                        return runtime
                except httpx.RequestError:
                    pass
                await asyncio.sleep(0.1)
            if process.returncode is None:
                process.terminate()
                await process.wait()
            log.close()
            del self.active[workspace]
            raise HTTPException(503, 'Runtime startup failed; inspect the local runtime log')

    async def close(self):
        for runtime in self.active.values():
            if runtime.process.returncode is None:
                runtime.process.terminate()
                try:
                    await asyncio.wait_for(runtime.process.wait(), 10)
                except TimeoutError:
                    runtime.process.kill()
                    await runtime.process.wait()
            runtime.log.close()
        self.active.clear()


# Explicit development capabilities. No legacy management, settings, files,
# plugin installation or host terminal is exposed by this account gateway.
def allowed(method: str, path: str) -> bool:
    routes = {
        'GET': [r'/v1/threads', r'/v1/threads/[^/]+', r'/v1/threads/[^/]+/events',
                r'/v1/threads/[^/]+/context', r'/v1/(approvals|elevations|user-inputs)/pending', r'/v1/model-catalog'],
        'POST': [r'/v1/threads', r'/v1/threads/[^/]+/(turns|fork)',
                 r'/v1/threads/[^/]+/turns/[^/]+/(interrupt|steer)',
                 r'/v1/(approvals|elevations|user-inputs)/[^/]+'],
        'PATCH': [r'/v1/threads/[^/]+'],
        'DELETE': [r'/v1/threads/[^/]+'],
    }
    return any(re.fullmatch(pattern, path) for pattern in routes.get(method, []))


def create_app(settings: Settings, *, transport=None, runtimes=None) -> FastAPI:
    manager = runtimes or Runtimes(settings)
    http = httpx.AsyncClient(transport=transport, timeout=15, follow_redirects=False, trust_env=False)

    @asynccontextmanager
    async def lifespan(app):
        try:
            yield
        finally:
            await manager.close()
            await http.aclose()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[
        'capacitor://localhost', 'http://localhost', 'https://localhost',
        'http://127.0.0.1:5178', 'http://127.0.0.1:5180',
    ], allow_methods=['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type'])

    async def identity(request: Request):
        header = request.headers.get('authorization', '')
        if not header.startswith('Bearer ') or len(header) > 16384:
            raise HTTPException(401, 'Sign in required')
        headers = {'Authorization': header, 'apikey': settings.public_key}
        try:
            user = await http.get(settings.auth_url + '/auth/v1/user', headers=headers)
            if user.status_code in (401, 403):
                raise HTTPException(401, 'Session expired')
            user.raise_for_status()
            rows = await http.get(settings.auth_url + '/rest/v1/workspaces',
                                  params={'select': 'id,name', 'order': 'created_at.asc'}, headers=headers)
            rows.raise_for_status()
            return user.json()['id'], rows.json()
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(503, 'Identity service unavailable') from None

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'deployment': 'local-development', 'public_ready': False}

    @app.get('/v1/me')
    async def me(request: Request):
        user, spaces = await identity(request)
        return {'user_id': user, 'workspaces': spaces, 'deployment': 'local-development'}

    @app.api_route('/spaces/{workspace}/{path:path}', methods=['GET', 'POST', 'PATCH', 'DELETE'])
    async def forward(workspace: str, path: str, request: Request):
        _, spaces = await identity(request)
        try:
            workspace = str(UUID(workspace))
        except ValueError:
            raise HTTPException(404, 'Workspace not found') from None
        if not any(row['id'] == workspace for row in spaces):
            raise HTTPException(404, 'Workspace not found')
        target = '/' + path
        body = bytearray()
        try:
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 1024 * 1024:
                    raise HTTPException(413, 'Request too large')
        except ClientDisconnect:
            return Response(status_code=499)
        if target == '/legacy/app' and request.method == 'POST':
            try:
                operation = json.loads(body)
            except ValueError:
                raise HTTPException(400, 'Invalid JSON') from None
            if operation != {'op': 'capabilities'}:
                raise HTTPException(403, 'Unsupported operation')
            return {'capabilities': {'tasks': False, 'mcp': False, 'plugins': False,
                                    'files': False, 'terminal': False, 'automations': False}}
        if target == '/v1/model-catalog' and request.method == 'GET':
            return {'active_provider': 'deepseek', 'providers': [{
                'id': 'deepseek', 'configured': True, 'discoverable': False,
                'default_model': 'deepseek-flash', 'source': 'offline-development',
                'models': ['deepseek-flash', 'offline-alternate'],
            }]}
        if not allowed(request.method, target):
            raise HTTPException(403, 'This capability is not enabled in the account development environment')
        if request.method in ('POST', 'PATCH'):
            try:
                value = json.loads(body or b'{}')
            except ValueError:
                raise HTTPException(400, 'Invalid JSON') from None
            # Runtime validates the rest; users cannot select arbitrary host paths.
            if not isinstance(value, dict) or any(key in value for key in ('workspace', 'cwd', 'env_mode', 'worktree_path')):
                raise HTTPException(400, 'Host workspace selection is disabled')
        runtime = await manager.get(workspace, http)
        headers = {'Authorization': 'Bearer ' + runtime.token, 'Content-Type': 'application/json'}
        upstream = http.build_request(request.method, runtime.url + target,
                                      params=request.query_params, content=bytes(body), headers=headers,
                                      timeout=httpx.Timeout(30, read=None if target.endswith('/events') else 30))
        try:
            response = await http.send(upstream, stream=True)
        except httpx.RequestError:
            raise HTTPException(503, 'Runtime unavailable; operation was not retried') from None
        content_type = response.headers.get('content-type', 'application/json')
        if content_type.startswith('text/event-stream'):
            async def events():
                iterator = response.aiter_bytes().__aiter__()
                pending = None
                try:
                    last_check = 0.0
                    while True:
                        pending = pending or asyncio.create_task(anext(iterator))
                        ready, _ = await asyncio.wait({pending}, timeout=5)
                        now = asyncio.get_running_loop().time()
                        if now - last_check >= 5:
                            _, current = await identity(request)
                            if not any(row['id'] == workspace for row in current):
                                return
                            last_check = now
                        if ready:
                            try:
                                yield pending.result()
                            except StopAsyncIteration:
                                return
                            pending = None
                except (HTTPException, httpx.RequestError):
                    return
                finally:
                    if pending:
                        pending.cancel()
                        await asyncio.gather(pending, return_exceptions=True)
                    await response.aclose()
            return StreamingResponse(events(), status_code=response.status_code,
                                     headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'}, media_type=content_type)
        try:
            return Response(await response.aread(), status_code=response.status_code,
                            headers={'Content-Type': content_type, 'Cache-Control': 'no-store'})
        finally:
            await response.aclose()
    return app
