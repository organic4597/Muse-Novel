import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExternalServiceEndpointForm } from './external-service-endpoint-form';

describe('ExternalServiceEndpointForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('identifies embedding tests without putting the API key in browser data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: async () => null,
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ message: 'API 연결 성공', ok: true }),
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ExternalServiceEndpointForm
        defaultUrl="http://127.0.0.1:8081"
        description="테스트 설명"
        healthPath="/v1/models"
        serviceType="embedding"
        title="임베딩 API"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '연결 테스트' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '연결 테스트' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toEqual({
      baseUrl: 'http://127.0.0.1:8081',
      healthPath: '/v1/models',
      serviceType: 'embedding',
    });
    expect(String(request.body)).not.toContain('API_KEY');
    expect(String(request.body)).not.toContain('Bearer');
  });
});
