import { useState } from 'react';
type Usage = { input_tokens?: number; output_tokens?: number; total_tokens?: number; turns?: number; cost_usd?: number; cost_cny?: number; model?: string };
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const count = (v: unknown) => valid(v) ? v.toLocaleString('zh-CN') : '—';
const compact = (v: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const cost = (row: Usage) => valid(row.cost_cny) && row.cost_cny > 0 ? `约 ¥${row.cost_cny.toFixed(4)}` : valid(row.cost_usd) && row.cost_usd > 0 ? `约 US$${row.cost_usd.toFixed(4)}` : '未估算';
function ModelChart({ rows }: { rows: Usage[] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const points = [...rows].sort((a, b) => ((b.input_tokens || 0) + (b.output_tokens || 0)) - ((a.input_tokens || 0) + (a.output_tokens || 0))).map((row, index) => ({ row, key: `${row.model}:${index}`, amount: valid(row.input_tokens) && valid(row.output_tokens) ? row.input_tokens + row.output_tokens : null }));
  const selected = points.find(p => p.key === chosen) || points[0];
  const max = Math.max(1, ...points.map(p => p.amount ?? 0));
  if (!selected) return null;
  return <article className="model-chart" aria-label="按模型查看">
    <header><h3>按模型</h3></header>
    <div className="chart-legend"><span><i className="token-input" />输入</span><span><i className="token-output" />输出</span><small>Token</small></div>
    <div className="model-bars" role="group" aria-label="选择模型查看用量">
      {points.map(({ row, key, amount }) => <button key={key} className="model-bar-button" aria-pressed={selected.key === key}
        aria-label={`${row.model || '未标注模型'}，输入 ${count(row.input_tokens)}，输出 ${count(row.output_tokens)}`} onClick={() => setChosen(key)}>
        <span className="model-bar-value">{amount === null ? '—' : compact(amount)}</span>
        <span className="model-bar-track"><span className="model-bar-stack" style={{ height: `${(amount ?? 0) / max * 100}%` }}>
          <span className="token-output" style={{ flex: row.output_tokens || 0 }} /><span className="token-input" style={{ flex: row.input_tokens || 0 }} />
        </span></span>
        <span className="model-bar-label">{row.model || '未标注模型'}</span>
      </button>)}
    </div>
    <div className="model-selection" aria-live="polite"><strong>{selected.row.model || '未标注模型'}</strong>
      <dl className="usage-metrics"><div><dt>输入</dt><dd>{count(selected.row.input_tokens)}</dd></div><div><dt>输出</dt><dd>{count(selected.row.output_tokens)}</dd></div><div><dt>回合</dt><dd>{count(selected.row.turns)}</dd></div><div><dt>费用</dt><dd>{cost(selected.row)}</dd></div></dl>
    </div>
  </article>;
}
export function UsageView({ data }: { data: unknown }) {
  const value = data as { totals?: Usage; buckets?: Usage[] } | null;
  if (!value || !Array.isArray(value.buckets) || !value.totals) return <div className="empty"><h2>用量暂不可用</h2><p>请稍后刷新。</p></div>;
  const totals = value.totals;
  const rows = value.buckets.filter((row): row is Usage => !!row && typeof row === "object");
  const inconsistent = (row: Usage) => valid(row.input_tokens) && valid(row.output_tokens) && valid(row.total_tokens) && row.input_tokens + row.output_tokens !== row.total_tokens;
  return <section className="usage-view" aria-label="模型用量">
    <div className="usage-heading"><h2>Token 用量</h2><span>本次电脑运行期间</span></div>
    {!rows.length ? <div className="empty"><h3>暂无用量记录</h3></div> : <>
      {[totals, ...rows].some(inconsistent) && <p className="usage-notice" role="status">总量口径不一致，已按输入与输出计算</p>}
      <dl className="usage-overview"><div><dt>输入 Token</dt><dd>{count(totals.input_tokens)}</dd></div><div><dt>输出 Token</dt><dd>{count(totals.output_tokens)}</dd></div></dl>
      <ModelChart rows={rows} />
    </>}
    <details className="usage-help"><summary>统计说明</summary><p>电脑服务重启后重新统计，中断请求可能不完整。费用以服务商账单为准。</p></details>
  </section>;
}
