export type OpenCodeOAuthModel = { id: string; name: string; isDefault: boolean };

export type OpenCodeOAuthState = {
  connected: boolean;
  email?: string;
  error?: string;
  login?: { expiresAt: number; userCode: string; verificationUrl: string };
  models: OpenCodeOAuthModel[];
};
