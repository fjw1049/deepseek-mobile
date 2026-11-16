import asyncio
from pathlib import Path
from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient

from server.gateway import Settings, allowed, create_app

A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'


class Runtimes:
    def __init__(self):
        self.calls = []

    async def get(self, workspace, http):
        self.calls.append(workspace)
        return SimpleNamespace(url='http://runtime.test', token='private-runtime-secret')

    async def close(self):
        pass


def setup():
    forwarded = []
    runtimes = Runtimes()

    def handle(request):
        token = request.headers.get('authorization')
        if request.url.host == 'auth.test':
            if token not in ('Bearer user-a', 'Bearer user-b'):
                return httpx.Response(401, json={})
            if request.url.path == '/auth/v1/user':
                return httpx.Response(200, json={'id': token[-1]})
            return httpx.Response(200, json=[{'id': A if token.endswith('a') else B, 'name': 'Personal'}])
        forwarded.append(request)
        return httpx.Response(200, json=[])

    settings = Settings('http://auth.test', 'public-key', Path('/unused'), Path('/unused'), 'unused')
    return create_app(settings, transport=httpx.MockTransport(handle), runtimes=runtimes), runtimes, forwarded


def test_cross_workspace_and_anonymous_denied_before_runtime():
    app, runtimes, forwarded = setup()
    with TestClient(app) as client:
        assert client.get(f'/spaces/{A}/v1/threads').status_code == 401
        assert client.get(f'/spaces/{B}/v1/threads', headers={'Authorization': 'Bearer user-a'}).status_code == 404
        assert client.get(f'/spaces/{A}/v1/threads', headers={'Authorization': 'Bearer user-b'}).status_code == 404
    assert not forwarded and not runtimes.calls


def test_own_space_forwards_with_internal_credential_not_user_token():
    app, runtimes, forwarded = setup()
    with TestClient(app) as client:
        response = client.get(f'/spaces/{A}/v1/threads', headers={'Authorization': 'Bearer user-a'})
        assert response.status_code == 200
        assert runtimes.calls == [A]
        assert forwarded[0].headers['authorization'] == 'Bearer private-runtime-secret'
        assert 'private-runtime-secret' not in response.text


def test_host_paths_management_and_legacy_ipc_are_not_exposed():
    app, runtimes, forwarded = setup()
    headers = {'Authorization': 'Bearer user-a'}
    with TestClient(app) as client:
        assert client.post(f'/spaces/{A}/v1/threads', headers=headers, json={'workspace': '/etc'}).status_code == 400
        assert client.post(f'/spaces/{A}/legacy/app', headers=headers, json={'op': 'settings'}).status_code == 403
        assert client.post(f'/spaces/{A}/v1/threads/t/terminal', headers=headers, json={}).status_code == 403
        assert client.get(f'/spaces/{A}/v1/mobile/devices', headers=headers).status_code == 403
    assert not forwarded and not runtimes.calls


def test_mutations_are_forwarded_once():
    app, _, forwarded = setup()
    with TestClient(app) as client:
        assert client.post(f'/spaces/{A}/v1/threads/t/turns', headers={'Authorization': 'Bearer user-a'},
                           json={'prompt': 'hello'}).status_code == 200
    assert len(forwarded) == 1
    assert allowed('POST', '/v1/approvals/a')
    assert not allowed('POST', '/v1/threads/t/events')


def test_invalid_and_oversized_payloads_do_not_reach_runtime():
    app, runtimes, forwarded = setup()
    headers = {'Authorization': 'Bearer user-a'}
    with TestClient(app) as client:
        assert client.post(f'/spaces/{A}/legacy/app', headers=headers, content='bad').status_code == 400
        assert client.post(f'/spaces/{A}/legacy/app', headers=headers, content='x' * (1024 * 1024 + 1)).status_code == 413
        assert client.post(f'/spaces/{A}/v1/threads/t/fork', headers=headers, json={'workspace': '/etc'}).status_code == 400
        assert client.patch(f'/spaces/{A}/v1/threads/t', headers=headers, json=[]).status_code == 400
    assert not forwarded and not runtimes.calls
