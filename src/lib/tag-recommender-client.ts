/**
 * Client for the tag recommender Python server.
 * Auto-starts the server on first request, keeps it running across requests.
 */
import { type ChildProcess, spawn } from 'child_process';
import path from 'path';

const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = Number(process.env.TAG_RECOMMENDER_PORT ?? 9877);
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const STARTUP_TIMEOUT = 120_000; // 2 min for model loading
const REQUEST_TIMEOUT = 30_000;

let serverProcess: ChildProcess | null = null;
let serverReady = false;
let startingPromise: Promise<void> | null = null;

export interface RecommendedTag {
  tag: string;
  category: string;
  categoryLabel: string;
  color: string;
  reason: string;
  score: number;
}

async function isServerHealthy(timeoutMs: number = 2000): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure the server is running. Starts it if needed.
 */
async function ensureServer(): Promise<void> {
  if (await isServerHealthy()) {
    serverReady = true;
    return;
  }

  serverReady = false;
  serverProcess = null;

  if (startingPromise) return startingPromise;

  startingPromise = new Promise<void>((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'tag_recommender_server.py');
    let startupComplete = false;
    const proc = spawn('python3', [scriptPath, '--serve', '--port', String(SERVER_PORT)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess = proc;
    let stdoutBuf = '';

    const timeout = setTimeout(() => {
      startupComplete = true;
      startingPromise = null;
      reject(new Error('Tag recommender server startup timed out'));
      proc.kill();
    }, STARTUP_TIMEOUT);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      // Server prints JSON {"status": "ready", "port": ...} when ready
      if (stdoutBuf.includes('"ready"')) {
        clearTimeout(timeout);
        startupComplete = true;
        serverReady = true;
        startingPromise = null;
        resolve();
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      // Forward server logs to console
      const msg = chunk.toString().trim();
      if (msg) console.log(msg);
    });

    proc.on('exit', (code) => {
      const exitedBeforeReady = !startupComplete;
      serverReady = false;
      serverProcess = null;
      startingPromise = null;
      if (exitedBeforeReady) {
        clearTimeout(timeout);
        reject(new Error(`Tag recommender server exited with code ${code}`));
      }
    });
  });

  return startingPromise;
}

/**
 * Recommend tags from text descriptions.
 * Handles Korean→English translation internally.
 */
export async function recommendTags(
  texts: Record<string, string>,
  options?: {
    topK?: number;
    threshold?: number;
    excludeCategories?: string[];
    autoSplit?: boolean;
    translate?: boolean;
  }
): Promise<RecommendedTag[]> {
  await ensureServer();

  const res = await fetch(`${SERVER_URL}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      texts,
      topK: options?.topK ?? 30,
      threshold: options?.threshold ?? 0.25,
      excludeCategories: options?.excludeCategories ?? ['artist'],
      autoSplit: options?.autoSplit ?? true,
      translate: options?.translate ?? true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`Tag recommender request failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.tags ?? [];
}

/**
 * Translate Korean texts to English.
 */
export async function translateTexts(texts: string[]): Promise<string[]> {
  await ensureServer();

  const res = await fetch(`${SERVER_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`Translation request failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.translations ?? texts;
}

/**
 * Shutdown the server gracefully.
 */
export async function shutdownServer(): Promise<void> {
  if (!serverReady && !serverProcess) return;
  try {
    await fetch(`${SERVER_URL}/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // If fetch fails, kill the process directly
    serverProcess?.kill();
  }
  serverProcess = null;
  serverReady = false;
}
