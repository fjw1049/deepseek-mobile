import { describe, it, expect } from 'vitest';
import { answerText, failureGuidance, groupConversation, presentTurn, processLabel, messageText } from '../src/conversation';
import type { Item, Turn } from '../src/protocol';
const turn: Turn = { id: 't1', status: 'completed' };
function item(id: string, kind: string, text = '', segment?: string): Item {
  return { id, turn_id: 't1', kind, status: 'completed', summary: text, detail: text, metadata: segment ? { agent_segment: segment } : {} };
}
describe('conversation presentation', () => {
  it('keeps only final answers outside the process and removes empty narration', () => {
    const user = item('u', 'user_message', '查看活动');
    const preface = item('p', 'agent_message', '我先核对信息', 'mid_turn_preface');
    const blank = item('b', 'agent_message', '', 'mid_turn_preface');
    const tool = item('tool', 'tool_call', 'search_skills: {"matches": []}');
    const answer = item('a', 'agent_message', '活动信息如下', 'final_answer');
    const view = presentTurn([user, preface, blank, tool, answer], turn);
    expect(view.users).toEqual([user]);
    expect(view.answers).toEqual([answer]);
    expect(view.process).toEqual([preface, tool]);
    expect(view.toolCount).toBe(1);
    expect(processLabel(tool)).toBe('查找可用技能');
  });
  it('shows streaming text, then moves a preface into process when a tool starts', () => {
    const streaming = { ...item('s', 'agent_message', '正在查看', 'mid_turn_preface'), status: 'in_progress' };
    expect(presentTurn([streaming], { ...turn, status: 'in_progress' }).live).toEqual(streaming);
    const completed = { ...streaming, status: 'completed' };
    const tool = item('tool', 'tool_call', 'browser_use started');
    const view = presentTurn([completed, tool], { ...turn, status: 'in_progress' });
    expect(view.live).toBeUndefined();
    expect(view.answers).toEqual([]);
    expect(view.process).toEqual([completed, tool]);
  });
  it('retains failed and stopped work without treating its preface as an answer', () => {
    const preface = item('p', 'agent_message', '开始执行', 'mid_turn_preface');
    const error = { ...item('err', 'error', '执行失败'), status: 'failed' };
    for (const status of ['failed', 'interrupted']) {
      const view = presentTurn([preface, error], { ...turn, status });
      expect(view.answers).toEqual([]);
      expect(view.process).toEqual([preface, error]);
    }
  });
  it('supports legacy answers and never merges different turns', () => {
    const items = [item('before', 'agent_message', '准备查询'), item('tool', 'tool_call', '查询记录'), item('after', 'agent_message', '查询完成')];
    expect(presentTurn(items, turn).answers.map(i => i.id)).toEqual(['after']);
    const next = { ...item('next', 'user_message', '下一个问题'), turn_id: 't2' };
    expect(groupConversation([...items, next], [turn, { id: 't2', status: 'queued' }]).map(g => [g.id, g.items.length])).toEqual([['t1', 3], ['t2', 1]]);
  });
  it('preserves empty structured tool records while never offering an empty answer', () => {
    const tool = { ...item('tool', 'tool_call'), metadata: { tool_name: 'load_skill', tool_input: { name: 'example' } } };
    const view = presentTurn([item('blank', 'agent_message', '', 'final_answer'), tool], turn);
    expect(view.answers).toEqual([]);
    expect(view.process).toEqual([tool]);
    expect(processLabel(tool)).toBe('读取技能说明');
  });
});

describe('Runtime completion notes', () => {
  const note = "---\n\n**核验状态**（系统生成）\n\n- 运行中断：Live request exceeds the fixed model/output/input boundary";
  it('does not turn a system-only failure into a model answer', () => {
    const record = { ...item('note', 'agent_message', note, 'final_answer'), metadata: { agent_segment: 'final_answer', completion_note: note } };
    const view = presentTurn([record], { ...turn, status: 'failed' });
    expect(view.answers).toEqual([]);
    expect(view.process).toEqual([record]);
    expect(answerText(record)).toBe('');
    expect(failureGuidance('Live request exceeds the fixed model/output/input boundary')).toContain('更新并重启电脑服务');
  });
  it('preserves a real partial answer and unrelated text verbatim', () => {
    const record = { ...item('a', 'agent_message', '已完成第一步\n\n' + note, 'final_answer'), metadata: { agent_segment: 'final_answer', completion_note: note } };
    expect(answerText(record)).toBe('已完成第一步');
    expect(presentTurn([record], turn).answers).toEqual([record]);
    expect(answerText({ ...record, detail: '用户引用核验状态，不是系统后缀' })).toBe('用户引用核验状态，不是系统后缀');
  });
});

describe('system verification notes', () => {
  const note = '\n\n---\n\n**核验状态**（系统生成）\n\n- 运行中断：Live request exceeds the fixed model/output/input boundary';
  it('keeps a failed system-only report out of the answer and preserves its details', () => {
    const report = { ...item('report', 'agent_message', note, 'final_answer'), metadata: { agent_segment: 'final_answer', completion_note: note } };
    const view = presentTurn([report], { ...turn, status: 'failed' });
    expect(view.answers).toEqual([]);
    expect(view.process.some(i => messageText(i).includes('Live request exceeds'))).toBe(true);
  });
  it('keeps a real answer while moving its marked suffix into the process', () => {
    const report = { ...item('report', 'agent_message', '已保存文件。' + note, 'final_answer'), metadata: { agent_segment: 'final_answer', completion_note: note } };
    const view = presentTurn([report], turn);
    expect(view.answers.map(answerText)).toEqual(['已保存文件。']);
    expect(report.metadata.completion_note).toBe(note);
    expect(report.detail).toContain(note);
  });
  it('never strips unmarked text or a note that does not match the suffix', () => {
    const original = item('answer', 'agent_message', '解释核验状态的含义。', 'final_answer');
    expect(presentTurn([original], turn).answers).toEqual([original]);
    const mismatch = { ...original, metadata: { ...original.metadata, completion_note: note } };
    expect(presentTurn([mismatch], turn).answers).toEqual([mismatch]);
  });
});


describe('recovery presentation boundaries', () => {
  it('does not hide an answer for an empty completion note', () => {
    const record = { ...item('a', 'agent_message', '正常回答'), metadata: { completion_note: '  \n ' } };
    expect(answerText(record)).toBe('正常回答');
  });
  it('does not echo a whole technical report into the recovery card', () => {
    const advice = failureGuidance('**核验状态**\n消息、历史和附件合计超过个人服务的 16 MiB 请求上限。\n内部诊断');
    expect(advice).toContain('减少附件');
    expect(advice).not.toContain('核验状态');
    expect(advice).not.toContain('内部诊断');
  });
});
