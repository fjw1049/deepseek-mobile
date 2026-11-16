"""Loopback-only entry point for the account development environment."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.gateway import Settings, create_app
import uvicorn

parser = argparse.ArgumentParser()
parser.add_argument('--config', type=Path, required=True)
parser.add_argument('--port', type=int, default=17881)
args = parser.parse_args()
value = json.loads(args.config.read_text())
settings = Settings(auth_url=value['auth_url'], public_key=value['public_key'],
                    runtime_source=Path(value['runtime_source']), data_dir=Path(value['data_dir']),
                    python=value['python'])
uvicorn.run(create_app(settings), host='127.0.0.1', port=args.port, log_level='warning', timeout_graceful_shutdown=5)
