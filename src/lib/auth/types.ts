export type ScryptParameters = {
  N: number;
  r: number;
  p: number;
  keyLength: number;
  maxmem: number;
};

export type PasswordDigest = {
  algorithm: 'scrypt';
  version: 1;
  salt: string;
  hash: string;
  parameters: ScryptParameters;
};

export type AuthCredential = {
  schemaVersion: 1;
  username: string;
  password: PasswordDigest;
  sessionEpoch: number;
  createdAt: string;
  updatedAt: string;
};

export type SessionClaims = {
  version: 1;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  epoch: number;
};
