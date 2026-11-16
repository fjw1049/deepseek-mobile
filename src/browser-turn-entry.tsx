import { Globe, X } from 'lucide-react';
import type { Item } from './protocol';
import { messageText } from './conversation';

export function isBrowserItem(item: Item) {
  if (item.kind !== 'tool_call') return false;
  const name = typeof item.metadata?.tool_name === 'string'
    ? item.metadata.tool_name : item.summary.match(/^([\w.-]+)(?=[:\s]|$)/)?.[1];
  return name === 'browser_use' || name === 'browser';
}
export function BrowserTurnEntry({ items, running, openBrowser, hide }: {
  items: Item[]; running: boolean; openBrowser: () => void; hide: () => void;
}) {
  return <div className="browser-turn-entry">
    <details>
      <summary><Globe size={16} /><span>{running ? '本轮正在浏览网页' : '本轮浏览了网页'}</span><small>查看</small></summary>
      <div className="browser-turn-body">
        <p>本轮记录 · 实时画面可能已更新</p>
        {items.map(item => <details key={item.id} className="browser-operation"><summary>{item.status === 'failed' ? '失败原因与技术详情' : '查看技术详情'}</summary><pre>{messageText(item)}</pre></details>)}
        <button onClick={openBrowser}>查看当前浏览器</button>
      </div>
    </details>
    <button className="browser-entry-hide" aria-label="隐藏本轮网页入口" title="隐藏入口，不停止任务" onClick={hide}><X size={16} /></button>
  </div>;
}
