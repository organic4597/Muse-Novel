import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorylineChatPanel } from './storyline-chat-panel';

describe('storyline chat panel', () => {
  afterEach(() => vi.unstubAllGlobals());
  const props = { projectId: 'project', noteId: 'note', beforeSend: vi.fn(async () => true), onAppend: vi.fn(async () => true) };
  it('streams a reply, re-enables input, and changes notes only when explicitly approved', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ messages: [], revision: 0, chapters: [] })).mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);
    const onAppend = vi.fn(async () => true);
    render(<StorylineChatPanel {...props} onAppend={onAppend} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const input = screen.getByLabelText('스토리라인 AI에게 질문');
    fireEvent.change(input, { target: { value: '다음 전개는?' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '전송' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '전송' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const send = (event: string, data: unknown) => controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    await act(async () => { send('delta', { text: '갈등을 선택으로 연결해 보세요.' }); });
    await screen.findByText('갈등을 선택으로 연결해 보세요.');
    expect(input).toBeDisabled(); expect(onAppend).not.toHaveBeenCalled();
    const answer = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'assistant', text: '갈등을 선택으로 연결해 보세요.' };
    await act(async () => { send('done', { messages: [answer], revision: 1 }); controller.close(); });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '노트 끝에 추가' }));
    await waitFor(() => expect(onAppend).toHaveBeenCalledWith(answer.text));
    expect(props.beforeSend).toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ message: '다음 전개는?', revision: 0, chapterId: null });
  });
  it('restores the question and unlocks input on a provider error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ messages: [], revision: 0, chapters: [] }))
      .mockResolvedValueOnce(Response.json({ error: 'AI 환경을 설정해주세요.' }, { status: 503 })));
    render(<StorylineChatPanel {...props} />);
    const input = screen.getByLabelText('스토리라인 AI에게 질문');
    fireEvent.change(input, { target: { value: '인과를 검토해줘' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '전송' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '전송' }));
    await screen.findByText(/AI 환경을 설정해주세요/);
    expect(input).toBeEnabled(); expect(input).toHaveValue('인과를 검토해줘');
  });
});
