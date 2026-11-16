"""Opt-in offline integration with the original Engine, never a paid provider.

RUN_RUNTIME_INTEGRATION=1 ORIGINAL_REPO/.venv/bin/python -m pytest server -q
"""
import asyncio
import os
from pathlib import Path

import httpx
import pytest

from server.gateway import Runtimes, Settings


@pytest.mark.skipif(os.environ.get('RUN_RUNTIME_INTEGRATION') != '1', reason='explicit local process test')
def test_real_engine_workspace_isolation_sync_and_restart(tmp_path):
    async def check():
        source = Path(os.environ.get('RUNTIME_SOURCE', '../deepseek-tui-py-main')).resolve()
        settings = Settings('', '', source, tmp_path, str(source / '.venv/bin/python'))
        manager = Runtimes(settings)
        async with httpx.AsyncClient(trust_env=False, timeout=20) as http:
            try:
                a = await manager.get('workspace-a', http)
                b = await manager.get('workspace-b', http)
                assert a is await manager.get('workspace-a', http)
                assert a.url != b.url and a.token != b.token
                ah = {'Authorization': 'Bearer ' + a.token}
                bh = {'Authorization': 'Bearer ' + b.token}
                assert (await http.get(a.url + '/v1/threads', headers=bh)).status_code == 401
                response = await http.post(a.url + '/v1/threads', headers=ah, json={'title': 'Private A'})
                assert response.status_code == 201
                thread = response.json()
                path = '/v1/threads/' + thread['id']
                assert (await http.get(b.url + path, headers=bh)).status_code == 404
                assert (await http.get(b.url + '/v1/threads', headers=bh)).json() == []
                updated = await http.patch(a.url + path, headers=ah, json={
                    'model': 'offline-alternate', 'auto_approve': True})
                assert updated.is_success, updated.text
                # A second client sees the server's settings immediately.
                snapshot = (await http.get(a.url + path, headers=ah)).json()
                assert snapshot['thread']['model'] == 'offline-alternate'
                assert snapshot['thread']['auto_approve'] is True
                response = await http.post(a.url + path + '/turns', headers=ah, json={'prompt': 'isolation-check'})
                assert response.status_code == 201, response.text
                for _ in range(100):
                    snapshot = (await http.get(a.url + path, headers=ah)).json()
                    if snapshot['turns'] and snapshot['turns'][-1]['status'] == 'completed':
                        break
                    await asyncio.sleep(.1)
                assert snapshot['turns'][-1]['status'] == 'completed'
                assert any('Offline Runtime (offline-alternate)' in (item.get('detail') or '') for item in snapshot['items'])
                # Reconnect from cursor zero: sequence numbers need not be contiguous.
                async with http.stream('GET', a.url + path + '/events?since_seq=0', headers=ah) as stream:
                    assert stream.status_code == 200
                    async for line in stream.aiter_lines():
                        if line.startswith('data:'):
                            break
                    else:
                        pytest.fail('Expected replayed event')
                await manager.close()
                restarted = await manager.get('workspace-a', http)
                saved = (await http.get(restarted.url + path,
                                       headers={'Authorization': 'Bearer ' + restarted.token})).json()
                assert saved['thread']['id'] == thread['id']
                assert saved['thread']['model'] == 'offline-alternate'
                assert len(saved['turns']) == 1
            finally:
                await manager.close()
    asyncio.run(check())
