import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorldSearch, type WorldSearchEntry } from './world-search';

const entries: WorldSearchEntry[] = [
  {
    id: 'shaolin',
    title: '소림사',
    category: '종파',
    content: '숭산에 자리한 불문 계열의 정파.',
    tags: [
      { id: 'tag-1', tag: '중원' },
      { id: 'tag-2', tag: '불교' },
    ],
  },
  {
    id: 'wudang',
    title: '무당파',
    category: '종파',
    content: '태극검과 내공으로 이름난 도가 문파.',
    tags: [{ id: 'tag-3', tag: '도교' }],
  },
  {
    id: 'market',
    title: '낙양 장터',
    category: '장소',
    content: '여러 종파의 소문이 모이는 번화한 시장.',
  },
];

describe('WorldSearch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['소림', '소림사'],
    ['장소', '낙양 장터'],
    ['태극검', '무당파'],
    ['불교', '소림사'],
  ])('%s 검색어를 내려온 항목에서 찾는다', async (query, expectedTitle) => {
    render(<WorldSearch entries={entries} />);

    fireEvent.change(screen.getByRole('searchbox', { name: '세계관 항목 검색' }), {
      target: { value: query },
    });

    expect(
      await screen.findByRole('button', { name: new RegExp(expectedTitle) })
    ).toBeInTheDocument();
  });

  it('여러 단어가 서로 다른 필드에 있어도 모두 일치하는 항목만 보여준다', async () => {
    render(<WorldSearch entries={entries} />);

    fireEvent.change(screen.getByRole('searchbox', { name: '세계관 항목 검색' }), {
      target: { value: '종파 중원' },
    });

    expect(
      await screen.findByRole('button', { name: /소림사/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /무당파/ })).not.toBeInTheDocument();
  });

  it('검색 중 서버에 요청하지 않고 선택한 항목 id를 전달한다', async () => {
    const fetchMock = vi.fn();
    const onSelectEntry = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldSearch entries={entries} onSelectEntry={onSelectEntry} />);

    fireEvent.change(screen.getByRole('searchbox', { name: '세계관 항목 검색' }), {
      target: { value: '무당' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /무당파/ }));

    await waitFor(() => expect(onSelectEntry).toHaveBeenCalledWith('wudang'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('일치하는 항목이 없으면 접근 가능한 상태 메시지를 표시한다', async () => {
    render(<WorldSearch entries={entries} />);

    fireEvent.change(screen.getByRole('searchbox', { name: '세계관 항목 검색' }), {
      target: { value: '없는 설정' },
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      '검색 결과가 없습니다'
    );
  });
});
