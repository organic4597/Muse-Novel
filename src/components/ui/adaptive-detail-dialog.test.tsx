import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdaptiveDetailDialogContent, getDetailDialogWidth } from './adaptive-detail-dialog';
import { Dialog, DialogTitle } from './dialog';

describe('content-aware detail dialog', () => {
  it('grows with saved content and caps very long entries', () => {
    expect(getDetailDialogWidth([null, '짧은 소개'])).toBe(640);
    const medium = getDetailDialogWidth(['설정'.repeat(500)]);
    expect(medium).toBeGreaterThan(640);
    expect(medium).toBeLessThan(1120);
    expect(getDetailDialogWidth(['긴 내용'.repeat(10_000)])).toBe(1120);
  });
  it('accounts for line-heavy notes and provides room for editing short entries', () => {
    expect(getDetailDialogWidth(['짧은 줄\n'.repeat(30)])).toBeGreaterThan(640);
    expect(getDetailDialogWidth(['짧은 소개'], true)).toBe(832);
  });
  it('limits both axes to the viewport without changing other dialog defaults', () => {
    render(<Dialog open><AdaptiveDetailDialogContent aria-describedby={undefined} sizingContent={['설정'.repeat(2000)]}>
      <DialogTitle>긴 설정</DialogTitle><p>본문</p>
    </AdaptiveDetailDialogContent></Dialog>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveStyle({ width: '1120px', maxWidth: 'calc(100vw - 2rem)' });
    expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-y-auto', '[overflow-wrap:anywhere]');
  });
});
