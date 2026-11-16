"""Offline integration fixture: real Runtime/Engine/routes, only the LLM is scripted.
Never points at the user's config, model account, workspace or thread database.
Usage: OLD_REPO/.venv/bin/python scripts/runtime-fixture.py --runtime-source OLD_REPO
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--runtime-source', type=Path, required=True)
parser.add_argument('--port', type=int, default=17878)
parser.add_argument('--receipts', type=Path, default=Path('/tmp/deepseek-mobile-fixture-receipts.json'))
args = parser.parse_args()
sys.path.insert(0, str(args.runtime_source / 'src'))
fixture = Path(tempfile.mkdtemp(prefix='deepseek-mobile-fixture-'))
os.environ['DEEPSEEK_HOME'] = str(fixture / 'home')
os.environ.pop('DEEPSEEK_RUNTIME_TOKEN', None)
(fixture / 'home').mkdir()
(fixture / 'workspace').mkdir()

from deepseek_tui.client.base import LLMClient
from deepseek_tui.config.models import Config, FeatureConfig
from deepseek_tui.protocol.responses import StreamTextDelta, StreamToolCallComplete, StreamDone, ToolCall
from deepseek_tui.server.runtime import AppRuntime
from deepseek_tui.server.app import build_fastapi_app
from deepseek_tui.server.threads import CreateThreadRequest
from deepseek_tui.server.approval import PendingApprovalRecord, PendingElevationRecord
import uvicorn

class OfflineClient(LLMClient):
    async def stream_chat_completion(self, request):
        users = [m.text_content() for m in request.messages if m.role == 'user' and m.text_content().strip()]
        prompt = users[-1] if users else ''
        if '停止测试' in prompt:
            for _ in range(120):
                yield StreamTextDelta(text='正在处理… ')
                await asyncio.sleep(.2)
        elif '追问测试' in prompt and not any(b.type == 'tool_result' and b.tool_use_id.startswith('mobile-question-') for m in request.messages for b in m.content):
            yield StreamToolCallComplete(tool_call=ToolCall(id='mobile-question-'+uuid.uuid4().hex[:8],name='request_user_input',arguments={'kind':'information','questions':[{'id':'scope','header':'范围','question':'选择这次实现范围','options':[{'label':'先跑通 App','description':'复用 Runtime'},{'label':'全部扩展','description':'稍后处理'}]}]}))
        else:
            for chunk in ['已通过现有 Runtime ', '收到手机消息。\n\n', '这是**真实引擎 + 离线模型**的联调结果。\n\n', '```python\nprint("Mobile connected")\n```']:
                yield StreamTextDelta(text=chunk)
                await asyncio.sleep(.15)
        yield StreamDone()

# Every factory path, including background tasks, stays offline in this isolated fixture.
import deepseek_tui.client.factory as client_factory
client_factory.build_llm_client = lambda *a, **kw: OfflineClient()
config = Config(features=FeatureConfig(mcp=False,tasks=True,subagents=False,automations=True,plugins=False,web_search=False))
receipts = {}

async def seed(app):
    manager = app.state.thread_manager
    thread = await manager.create_thread(CreateThreadRequest(title='授权联调',auto_approve=False))
    approval = manager._approval_bridge.register('appr_mobile_fixture',meta=PendingApprovalRecord(thread_id=thread.id,tool_name='fixture_review',description='离线授权测试，不执行命令'))
    elevation = manager._elevation_bridge.register('elev_mobile_fixture',meta=PendingElevationRecord(thread_id=thread.id,tool_name='fixture_elevation',reason='离线提权测试，不执行命令',command_preview='fixture-only',elevation_kind='sandbox'))
    async def record(name, future):
        receipts[name] = await future
        args.receipts.write_text(json.dumps(receipts))
    app.state.fixture_tasks = [asyncio.create_task(record('approval',approval)),asyncio.create_task(record('elevation',elevation))]

async def main():
    runtime = await AppRuntime.create(config=config,working_directory=fixture/'workspace',llm_client=OfflineClient())
    app = build_fastapi_app(runtime,http_mode=True,auth_token='mobile-offline-test',cors_origins=['capacitor://localhost','http://localhost','https://localhost'])
    manager = app.state.thread_manager
    manager._llm_client = OfflineClient()
    manager._get_llm_client = lambda *a, **kw: manager._llm_client
    await seed(app)
    print(f'OFFLINE_FIXTURE workspace={fixture} port={args.port}',flush=True)
    try:
        await uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=args.port,log_level='warning')).serve()
    finally:
        await runtime.shutdown()

asyncio.run(main())
