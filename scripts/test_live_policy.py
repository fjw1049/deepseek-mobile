import ast
import unittest
from pathlib import Path
from live_policy import validate_payload, PERSONAL_MAX_BYTES

class PolicyTests(unittest.TestCase):
    def test_daily_history_reproduces_old_failure_but_passes_personal_policy(self):
        payload = {'model': 'deepseek-flash', 'max_tokens': 1024}
        # Execute the original transport predicate against a multi-turn request size.
        source = "payload.get('model')!='deepseek-flash' or payload.get('max_tokens',10**9)>1024 or request_bytes>250000"
        self.assertTrue(eval(compile(ast.parse(source, mode='eval'), '<old-policy>', 'eval'), {'payload': payload, 'request_bytes': 300_000}))
        validate_payload(payload, 300_000, personal=True)
        with self.assertRaisesRegex(RuntimeError, '250 KB'):
            validate_payload(payload, 300_000, personal=False)

    def test_model_output_and_large_attachment_guards_remain(self):
        for personal in (True, False):
            with self.assertRaisesRegex(RuntimeError, 'deepseek-flash'):
                validate_payload({'model': 'other', 'max_tokens': 1024}, 100, personal=personal)
            for tokens in (None, 0, -1, 1025, True):
                with self.assertRaisesRegex(RuntimeError, '输出额度'):
                    validate_payload({'model': 'deepseek-flash', 'max_tokens': tokens}, 100, personal=personal)
        payload = {'model': 'deepseek-flash', 'max_tokens': 1024}
        validate_payload(payload, PERSONAL_MAX_BYTES, personal=True)
        with self.assertRaisesRegex(RuntimeError, '16 MiB'):
            validate_payload(payload, PERSONAL_MAX_BYTES + 1, personal=True)

    def test_real_transport_dispatch_and_quota(self):
        import asyncio, httpx, json, time
        from types import SimpleNamespace
        tree = ast.parse(Path(__file__).with_name('live-preview.py').read_text())
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'BudgetTransport')
        state = {'requests': [], 'max_requests': 1}
        args = SimpleNamespace(personal=True)
        scope = dict(httpx=httpx, json=json, time=time, args=args, state=state,
                     validate_payload=validate_payload, save=lambda: None)
        exec(compile(ast.Module(body=[cls], type_ignores=[]), '<transport>', 'exec'), scope)
        async def check():
            transport = scope['BudgetTransport']()
            await transport.inner.aclose()
            calls = []
            async def upstream(request):
                calls.append(request)
                return httpx.Response(200)
            transport.inner = httpx.MockTransport(upstream)
            def request(size=300_000, model='deepseek-flash'):
                return httpx.Request('POST', 'https://api.deepseek.com/chat/completions', json={
                    'model':model, 'max_tokens':1024, 'messages':[{'role':'user','content':'x'*size}]})
            await transport.handle_async_request(request())
            self.assertEqual(len(calls), 1)
            args.personal = False
            state['requests'].clear()
            with self.assertRaisesRegex(RuntimeError, '250 KB'):
                await transport.handle_async_request(request())
            self.assertEqual(len(state['requests']), 0)
            await transport.handle_async_request(request(10))
            with self.assertRaisesRegex(RuntimeError, '额度已用完'):
                await transport.handle_async_request(request(10))
            self.assertEqual(len(calls), 2)
            await transport.aclose()
        asyncio.run(check())

if __name__ == '__main__':
    unittest.main()
