import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { getClientKey, hasSafeMutationMetadata, isSecureRequest } from './request';

afterEach(() => {
  Reflect.deleteProperty(process.env, 'AUTH_TRUST_PROXY');
});

describe('authentication request metadata', () => {
  it('uses the external Host when Docker maps a different public port', () => {
    const request = new NextRequest(
      'http://internal-container:3000/api/projects',
      {
        headers: {
          host: 'muse.local:3210',
          origin: 'http://muse.local:3210',
          'sec-fetch-site': 'same-origin',
        },
        method: 'POST',
      }
    );

    expect(hasSafeMutationMetadata(request)).toBe(true);
  });

  it('ignores spoofable forwarding headers unless proxy trust is explicit', () => {
    const request = new NextRequest('http://muse.local/login', {
      headers: {
        'x-forwarded-for': '198.51.100.25',
        'x-forwarded-proto': 'https',
      },
    });
    expect(getClientKey(request)).toBe('direct-client');
    expect(isSecureRequest(request)).toBe(false);

    process.env.AUTH_TRUST_PROXY = '1';
    expect(getClientKey(request)).toBe('198.51.100.25');
    expect(isSecureRequest(request)).toBe(true);
  });

  it('requires an exact origin and validates Fetch Metadata when supplied', () => {
    const safe = new NextRequest('http://muse.local/api/projects', {
      method: 'POST',
      headers: { origin: 'http://muse.local', 'sec-fetch-site': 'same-origin' },
    });
    expect(hasSafeMutationMetadata(safe)).toBe(true);

    const crossSite = new NextRequest('http://muse.local/api/projects', {
      method: 'POST',
      headers: { origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' },
    });
    expect(hasSafeMutationMetadata(crossSite)).toBe(false);
    expect(
      hasSafeMutationMetadata(new NextRequest('http://muse.local/api/projects', { method: 'POST' }))
    ).toBe(false);
  });

  it('accepts LAN HTTP mutations without Fetch Metadata using the external Host', () => {
    const request = new NextRequest('http://internal-container:3000/api/auth/setup', {
      method: 'POST',
      headers: {
        host: '192.0.2.10:3210',
        origin: 'http://192.0.2.10:3210',
      },
    });
    expect(hasSafeMutationMetadata(request)).toBe(true);
  });

  it.each(['null', 'invalid', 'http://evil.example', 'https://muse.local:3210', 'http://muse.local:3000'])(
    'rejects an invalid or mismatched Origin: %s',
    (origin) => {
      for (const metadata of [undefined, 'same-origin']) {
        const request = new NextRequest('http://muse.local:3210/api/auth/setup', {
          method: 'POST',
          headers: { origin, ...(metadata ? { 'sec-fetch-site': metadata } : {}) },
        });
        expect(hasSafeMutationMetadata(request)).toBe(false);
      }
    }
  );

  it.each(['cross-site', 'same-site', 'none', 'unknown', ''])(
    'rejects contradictory Fetch Metadata even with matching Origin: %s',
    (metadata) => {
      const request = new NextRequest('http://muse.local/api/auth/setup', {
        method: 'POST',
        headers: { origin: 'http://muse.local', 'sec-fetch-site': metadata },
      });
      expect(hasSafeMutationMetadata(request)).toBe(false);
    }
  );

  it('uses forwarded origin only with explicit proxy trust when metadata is absent', () => {
    const request = new NextRequest('http://internal-container:3000/api/auth/setup', {
      method: 'POST',
      headers: {
        host: '192.0.2.10:3210',
        origin: 'https://muse.example:8443',
        'x-forwarded-host': 'muse.example:8443',
        'x-forwarded-proto': 'https',
      },
    });
    expect(hasSafeMutationMetadata(request)).toBe(false);
    process.env.AUTH_TRUST_PROXY = '1';
    expect(hasSafeMutationMetadata(request)).toBe(true);
  });
});
