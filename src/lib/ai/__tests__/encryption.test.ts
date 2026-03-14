import { describe, expect, it } from 'vitest';

import { decryptApiKey, encryptApiKey, maskApiKey } from '../encryption';

describe('Encryption Utility', () => {
  describe('encryptApiKey / decryptApiKey', () => {
    it('should encrypt and decrypt a key roundtrip', () => {
      const plainKey = 'nvapi-test1234567890abcdef';
      const encrypted = encryptApiKey(plainKey);
      const decrypted = decryptApiKey(encrypted);

      expect(encrypted).not.toBe(plainKey);
      expect(encrypted).toContain(':'); // iv:encrypted format
      expect(decrypted).toBe(plainKey);
    });

    it('should produce different ciphertexts for same input (random IV)', () => {
      const plainKey = 'sk-abc123';
      const encrypted1 = encryptApiKey(plainKey);
      const encrypted2 = encryptApiKey(plainKey);

      expect(encrypted1).not.toBe(encrypted2);
      // But both should decrypt to same value
      expect(decryptApiKey(encrypted1)).toBe(plainKey);
      expect(decryptApiKey(encrypted2)).toBe(plainKey);
    });

    it('should handle empty string', () => {
      expect(encryptApiKey('')).toBe('');
      expect(decryptApiKey('')).toBe('');
    });

    it('should handle unicode characters', () => {
      const plainKey = 'api-키-테스트-🔑';
      const encrypted = encryptApiKey(plainKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(plainKey);
    });

    it('should handle very long keys', () => {
      const plainKey = 'a'.repeat(500);
      const encrypted = encryptApiKey(plainKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(plainKey);
    });

    it('should return empty string for malformed encrypted data', () => {
      expect(decryptApiKey('not-valid-data')).toBe('');
    });
  });

  describe('maskApiKey', () => {
    it('should mask a normal API key (>8 chars)', () => {
      const masked = maskApiKey('nvapi-testKeyAbcMpg');
      expect(masked).toBe('nvapi****Mpg');
    });

    it('should mask a short key (≤8 chars)', () => {
      const masked = maskApiKey('sk-abc');
      expect(masked).toBe('sk****c');
    });

    it('should mask a very short key (≤3 chars)', () => {
      const masked = maskApiKey('abc');
      expect(masked).toBe('****');
    });

    it('should handle empty string', () => {
      expect(maskApiKey('')).toBe('');
    });

    it('should show first 5 + **** + last 3 for long keys', () => {
      const masked = maskApiKey('1234567890abcdef');
      expect(masked).toBe('12345****def');
    });
  });
});
