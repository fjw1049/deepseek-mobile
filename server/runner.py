"""Persistent, offline development Runtime. One process per workspace."""
import argparse
import asyncio
import os
from pathlib import Path
import socket

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--fd', type=int, required=True)
args = parser.parse_args()
(args.root / 'home').mkdir(exist_ok=True)
workspace = args.root / 'workspace'
workspace.mkdir(exist_ok=True)
os.chdir(workspace)

from deepseek_tui.client.base import LLMClient
from deepseek_tui.config.models import Config, FeatureConfig
from deepseek_tui.protocol.responses import StreamTextDelta, StreamDone
from deepseek_tui.server.runtime import AppRuntime
from deepseek_tui.server.app import build_fastapi_app
from deepseek_tui.workspace.project_lease import FileLease
import deepseek_tui.client.factory as factory
import uvicorn


class OfflineClient(LLMClient):
    async def stream_chat_completion(self, request):
        text = next((m.text_content() for m in reversed(request.messages) if m.role == 'user'), '')
        for part in [f'Offline Runtime ({request.model}): ', text]:
            yield StreamTextDelta(text=part)
            await asyncio.sleep(0.05)
        yield StreamDone()


async def main():
    lease = FileLease(args.root / 'runtime.lock')
    if not lease.acquire_blocking(nonblocking=True):
        raise RuntimeError('Another Runtime already owns this workspace')
    runtime = None
    try:
        factory.build_llm_client = lambda *a, **kw: OfflineClient()
        config = Config(default_text_model='deepseek-flash', model='deepseek-flash', allow_shell=False, features=FeatureConfig(
            mcp=False, tasks=False, subagents=False, automations=False, plugins=False, web_search=False),
            disabled_skill_sources=['claude', 'cursor', 'codex', 'opencode', 'qwen', 'gemini', 'codebuddy'])
        runtime = await AppRuntime.create(config=config, working_directory=workspace, llm_client=OfflineClient())
        app = build_fastapi_app(runtime, http_mode=True, auth_token=os.environ['DEEPSEEK_RUNTIME_TOKEN'])
        app.state.thread_manager._get_llm_client = lambda *a, **kw: OfflineClient()
        await uvicorn.Server(uvicorn.Config(app, log_level='warning', timeout_graceful_shutdown=3)).serve(
            sockets=[socket.socket(fileno=args.fd)])
    finally:
        if runtime:
            await runtime.shutdown()
        lease.release()


asyncio.run(main())
