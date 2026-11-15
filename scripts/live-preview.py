"""Bounded real-provider preview. Imports the existing Runtime; no fake LLM.
The API key is read with getpass, held in memory and never serialized.
"""
import argparse, asyncio, getpass, json, os, sys, time, socket, ipaddress
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--runtime-source',type=Path,required=True)
parser.add_argument('--data-dir',type=Path,required=True)
parser.add_argument('--port',type=int,default=17879)
parser.add_argument('--lan-host',type=ipaddress.IPv4Address)
args=parser.parse_args()
if args.lan_host and (not args.lan_host.is_private or args.lan_host.is_unspecified or args.lan_host.is_loopback):
 parser.error('--lan-host must be this Mac private LAN IPv4 address')
args.data_dir.mkdir(parents=True,exist_ok=True)
(args.data_dir/'home').mkdir(exist_ok=True)
(args.data_dir/'workspace').mkdir(exist_ok=True)
os.environ['DEEPSEEK_HOME']=str(args.data_dir/'home')
os.environ.pop('DEEPSEEK_RUNTIME_TOKEN',None)
sys.path.insert(0,str(args.runtime_source/'src'))
import httpx, uvicorn
from deepseek_tui.client.deepseek import DeepSeekClient
from deepseek_tui.client.base import RetryConfig
from deepseek_tui.config.models import Config,ProviderConfig,FeatureConfig
from deepseek_tui.protocol.responses import StreamDone,StreamToolCallComplete
from deepseek_tui.server.runtime import AppRuntime
from deepseek_tui.server.app import build_fastapi_app

key=getpass.getpass('Official DeepSeek API key (hidden): ').strip()
if not key: raise SystemExit('No API key supplied')
state={'provider':'https://api.deepseek.com','model':'deepseek-flash','max_requests':6,'manual_enabled':False,'max_output_tokens_per_request':1024,'requests':[],'usage':[],'tool_calls':[],'models_verified':False}
report=args.data_dir/'provider-report.json'
if report.is_file():
 prior=json.loads(report.read_text())
 if prior.get('provider')!=state['provider'] or prior.get('model')!=state['model']:raise SystemExit('Existing preview report belongs to another provider/model')
 for field in ('requests','usage','tool_calls','manual_enabled'):
  if field in prior:state[field]=prior[field]
 state['max_requests']=12 if state['manual_enabled'] else 6
def save(): report.write_text(json.dumps(state,ensure_ascii=False,indent=2))
class BudgetTransport(httpx.AsyncBaseTransport):
 def __init__(self):self.inner=httpx.AsyncHTTPTransport(retries=0)
 async def handle_async_request(self,request):
  if request.url.host!='api.deepseek.com' or request.url.scheme!='https':raise RuntimeError('Live test allows only the official DeepSeek endpoint')
  if request.method=='POST':
   if len(state['requests'])>=state['max_requests']:raise RuntimeError('本阶段真实验证额度已用完；可在 App 中显式开启手动验证额度。')
   payload=json.loads(request.content)
   if payload.get('model')!='deepseek-flash' or payload.get('max_tokens',10**9)>1024 or len(request.content)>250000:raise RuntimeError('Live request exceeds the fixed model/output/input boundary')
   row={'index':len(state['requests'])+1,'model':payload['model'],'max_tokens':payload['max_tokens'],'request_bytes':len(request.content),'started_at':time.time()}
   state['requests'].append(row);save()
   try:
    response=await self.inner.handle_async_request(request);row['status']=response.status_code;save();return response
   except Exception as exc:row['error_type']=type(exc).__name__;save();raise
  return await self.inner.handle_async_request(request)
 async def aclose(self):await self.inner.aclose()
class LiveClient(DeepSeekClient):
 def _build_payload(self,request):
  if request.model != 'deepseek-flash':raise RuntimeError('This personal preview only permits deepseek-flash; no fallback is allowed')
  payload=super()._build_payload(request.model_copy(update={'model':'deepseek-flash','max_tokens':1024,'reasoning_effort':'off'}))
  payload['max_tokens']=1024
  return payload
 async def stream_chat_completion(self,request):
  async for event in super().stream_chat_completion(request):
   if isinstance(event,StreamDone) and event.usage:state['usage'].append(event.usage.model_dump());save()
   if isinstance(event,StreamToolCallComplete):state['tool_calls'].append({'id':event.tool_call.id,'name':event.tool_call.name});save()
   yield event

async def main():
 async with httpx.AsyncClient(timeout=20) as check:
  response=await check.get('https://api.deepseek.com/models',headers={'Authorization':'Bearer '+key})
  if response.status_code!=200:raise SystemExit(f'Official models endpoint returned HTTP {response.status_code}; no generation request was made')
  models=[x['id'] for x in response.json()['data']]
  if 'deepseek-flash' not in models:raise SystemExit('Requested model is absent from official /models')
  state.update(models_verified=True,available_models=models);save()
 def new_client(config=None):
  if config is not None and (config.provider != 'deepseek' or config.model != 'deepseek-flash'):raise RuntimeError('Only official deepseek-flash is permitted in this preview')
  client=LiveClient(api_key=key,base_url='https://api.deepseek.com',thinking_supported=True,transport=BudgetTransport(),timeout_seconds=45)
  client.retry_config=RetryConfig(max_transparent_retries=0,max_error_retries=0)
  return client
 from deepseek_tui.client import factory
 factory.build_llm_client=new_client
 client=new_client()
 config=Config(provider='deepseek',model='deepseek-flash',default_text_model='deepseek-flash',reasoning_effort='off',providers={'deepseek':ProviderConfig(api_key=key,base_url='https://api.deepseek.com',model='deepseek-flash',max_tokens=1024)},features=FeatureConfig(mcp=True,tasks=True,subagents=True,automations=True,plugins=True,web_search=False),disabled_skill_sources=['claude','cursor','codex','opencode','qwen','gemini','codebuddy'])
 runtime=await AppRuntime.create(config=config,working_directory=args.data_dir/'workspace',llm_client=client)
 app=build_fastapi_app(runtime,http_mode=True,auth_token='mobile-live-review',cors_origins=['capacitor://localhost','http://localhost','https://localhost'])
 # The known preview administrator token is local-only; phones use paired credentials.
 @app.middleware('http')
 async def local_preview_admin(request, call_next):
  if request.headers.get('authorization') == 'Bearer mobile-live-review' and (not request.client or request.client.host not in ('127.0.0.1','::1')):
   from starlette.responses import JSONResponse
   return JSONResponse({'detail':'Use a paired device credential on the local network'},status_code=403)
  return await call_next(request)
 app.state.thread_manager._llm_client=client
 def fixed_client(provider=None):
  if provider not in (None,'deepseek'):raise ValueError('此有界验证只允许官方 DeepSeek 提供商')
  return client
 app.state.thread_manager._get_llm_client=fixed_client
 @app.get('/v1/preview-status')
 async def preview_status():
  return {'model':'deepseek-flash','remaining_requests':state['max_requests']-len(state['requests']),'max_requests':state['max_requests'],'max_output_tokens':1024,'manual_enabled':state['manual_enabled']}
 @app.post('/v1/preview-status/manual')
 async def enable_manual():
  if not state['manual_enabled']:
   state.update(manual_enabled=True,max_requests=12);save()
  return await preview_status()
 print(f'LIVE_PREVIEW_READY http://127.0.0.1:{args.port} model=deepseek-flash limit=12x1024',flush=True)
 sockets=[]
 try:
  for host in ['127.0.0.1'] + ([str(args.lan_host)] if args.lan_host else []):
   listener=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
   listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
   listener.bind((host,args.port));listener.listen(128);sockets.append(listener)
  await uvicorn.Server(uvicorn.Config(app,log_level='warning')).serve(sockets=sockets)
 finally:
  for listener in sockets:listener.close()
  await runtime.shutdown();await client.close()
asyncio.run(main())
