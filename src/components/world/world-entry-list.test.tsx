import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorldEntryList } from './world-entry-list';

vi.mock('./world-builder-assistant', () => ({
  WorldBuilderAssistant: ({
    onEntriesAdded,
  }: {
    onEntriesAdded?: (
      entries: Array<{
        id: string;
        projectId: string;
        category: string;
        title: string;
        content: string | null;
        tags: Array<{ id: string; tag: string }>;
        createdAt: Date | string | null;
        updatedAt: Date | string | null;
      }>
    ) => void;
  }) => (
    <button
      onClick={() =>
        onEntriesAdded?.([
          {
            id: 'emei',
            projectId: 'project-1',
            title: '아미파',
            category: '종파',
            content: '검법으로 이름난 문파.',
            tags: [{ id: 'tag-3', tag: '정파' }],
            createdAt: null,
            updatedAt: null,
          },
        ])
      }
      type="button"
    >
      어시스턴트 항목 추가
    </button>
  ),
}));

const entries = [
  {
    id: 'shaolin',
    projectId: 'project-1',
    title: '소림사',
    category: '종파',
    content: '숭산에 자리한 불문 계열의 정파.',
    tags: [{ id: 'tag-1', tag: '불교' }],
    createdAt: null,
    updatedAt: null,
  },
  {
    id: 'wudang',
    projectId: 'project-1',
    title: '무당파',
    category: '종파',
    content: '태극검과 내공으로 이름난 도가 문파.',
    tags: [{ id: 'tag-2', tag: '도교' }],
    createdAt: null,
    updatedAt: null,
  },
];

describe('WorldEntryList local tag filtering', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for confirmation, deletes only the category and keeps the moved cards visible', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ targetName: '기타', updatedEntries: 2, updatedSuggestions: 1,
      categories: [{ name: '기타', aliasesJson: '["종파"]' }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldEntryList entries={entries} projectId="project-1" savedCategories={['종파']} />);
    fireEvent.click(screen.getByRole('button', { name: '종파' }));
    fireEvent.click(screen.getByRole('button', { name: '카테고리 삭제' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('항목을 이동할 카테고리')).toHaveValue('기타');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '항목 보존 후 삭제' }));
    expect(await screen.findByRole('status')).toHaveTextContent('카테고리를 삭제했습니다');
    expect(screen.queryByRole('button', { name: '종파' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '소림사' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '무당파' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/world-categories', expect.objectContaining({
      method: 'DELETE', body: JSON.stringify({ name: '종파', targetName: '기타' }),
    }));
  });

  it('cancels deletion without sending a request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldEntryList entries={[]} projectId="project-1" savedCategories={['영약']} />);
    fireEvent.click(screen.getByRole('button', { name: '영약' }));
    fireEvent.click(screen.getByRole('button', { name: '카테고리 삭제' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '영약' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains the category and confirmation when deletion fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: '삭제 실패' }, { status: 409 })));
    render(<WorldEntryList entries={entries} projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: '종파' }));
    fireEvent.click(screen.getByRole('button', { name: '카테고리 삭제' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '항목 보존 후 삭제' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('삭제 실패');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '종파' })).toBeInTheDocument();
  });

  it('renames the selected category and updates its existing cards without keeping the old tab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ name: '문파', updatedEntries: 2,
      categories: [{ name: '문파', aliasesJson: '["종파"]' }] })));
    render(<WorldEntryList entries={entries} projectId="project-1" savedCategories={['종파']} />);
    fireEvent.click(screen.getByRole('button', { name: '종파' }));
    fireEvent.click(screen.getByRole('button', { name: '카테고리 이름 변경' }));
    fireEvent.change(screen.getByLabelText('변경할 카테고리 이름'), { target: { value: '문파' } });
    fireEvent.click(screen.getByRole('button', { name: '이름 변경 저장' }));
    expect(await screen.findByRole('button', { name: '문파' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '종파' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '소림사' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '무당파' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/projects/project-1/world-categories', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ name: '문파', oldName: '종파' }),
    }));
  });

  it('keeps the old name and entered text when the rename is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: '이미 사용 중인 카테고리 이름입니다.' }, { status: 409 })));
    render(<WorldEntryList entries={entries} projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: '종파' }));
    fireEvent.click(screen.getByRole('button', { name: '카테고리 이름 변경' }));
    fireEvent.change(screen.getByLabelText('변경할 카테고리 이름'), { target: { value: '물건' } });
    fireEvent.click(screen.getByRole('button', { name: '이름 변경 저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용 중');
    expect(screen.getByRole('button', { name: '종파' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('변경할 카테고리 이름')).toHaveValue('물건');
  });

  it('does not restore a renamed default category when loaded again', () => {
    render(<WorldEntryList categoryRecords={[{ name: '지역', aliasesJson: '["장소"]' }]} entries={[]} projectId="project-1"
      savedCategories={['지역']} />);
    expect(screen.getByRole('button', { name: '지역' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '장소' })).not.toBeInTheDocument();
  });

  it('저장한 빈 카테고리도 탭으로 표시하고 새 항목의 분류에 선택한다', () => {
    render(<WorldEntryList entries={[]} projectId="project-1" savedCategories={['영약']} />);
    expect(screen.getByRole('button', { name: '물건' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '기타' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '영약' }));
    fireEvent.click(screen.getByRole('button', { name: '새 항목' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '영약' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('카테고리 추가를 서버에 저장한 뒤 새 탭을 바로 선택한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ name: '영약' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldEntryList entries={[]} projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: '카테고리 추가' }));
    fireEvent.change(screen.getByLabelText('새 카테고리 이름'), { target: { value: '영약' } });
    fireEvent.click(screen.getByRole('button', { name: '카테고리 저장' }));
    expect(await screen.findByRole('button', { name: '영약' })).toHaveAttribute('aria-pressed', 'true');
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/world-categories', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ name: '영약' }),
    }));
  });

  it('이미 받은 태그로 목록을 필터링하며 서버에 요청하지 않는다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldEntryList entries={entries} projectId="project-1" />);

    fireEvent.click(screen.getByText('불교'));

    expect(screen.getByRole('heading', { name: '소림사' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '무당파' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('태그 필터:')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: '소림사' }).closest('button')
    ).toHaveClass('muse-render-lazy');
  });

  it('어시스턴트가 만든 항목을 페이지 새로고침 없이 목록에 합친다', () => {
    render(<WorldEntryList entries={entries} projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: '어시스턴트 항목 추가' }));

    expect(screen.getByRole('heading', { name: '아미파' })).toBeInTheDocument();
    expect(screen.getByText('정파')).toBeInTheDocument();
  });

  it('대규모 세계관 목록은 작은 첫 구간만 렌더링한 뒤 점진적으로 확장한다', () => {
    const largeEntries = Array.from({ length: 500 }, (_, index) => ({
      id: `entry-${index}`,
      projectId: 'project-1',
      title: `대규모 세계관 ${index}`,
      category: '장소',
      content: `세계관 성능 검증용 설명 ${index}`,
      tags: [],
      createdAt: null,
      updatedAt: null,
    }));

    render(<WorldEntryList entries={largeEntries} projectId="project-1" />);

    expect(
      screen.getAllByRole('heading', { name: /대규모 세계관/ })
    ).toHaveLength(48);
    fireEvent.click(screen.getByRole('button', { name: /48개 더 보기/ }));
    expect(
      screen.getAllByRole('heading', { name: /대규모 세계관/ })
    ).toHaveLength(96);
  });
});
