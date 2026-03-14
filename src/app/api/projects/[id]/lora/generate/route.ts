import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { db } from '@/lib/db';
import { listChapters } from '@/lib/db/queries/chapters';
import { createLora, setActiveLora } from '@/lib/db/queries/loras';
import {
  freeGpuForTraining,
  restartServerAfterTraining,
} from '@/lib/ai/qwen-server-manager';
import {
  acquireTrainingLock,
  releaseTrainingLock,
  updateTrainingLock,
} from '@/lib/ai/qlora-training-lock';
import {
  getHuggingFaceToken,
  getQloraBaseModel,
  getQloraPythonPath,
} from '@/lib/ai/qlora-runtime';
import {
  appendTrainingLog,
  readTrainingStatus,
  startTrainingStatus,
  updateTrainingStatus,
} from '@/lib/ai/qlora-training-status';

const TRAINING_CANCELLED_CODE = 'TRAINING_CANCELLED';

function extractPlainText(contentJson: string | null | undefined): string {
  if (!contentJson) return '';
  try {
    const doc = JSON.parse(contentJson);
    const texts: string[] = [];
    function walk(node: unknown): void {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (typeof n.text === 'string') {
        texts.push(n.text);
        return;
      }
      if (Array.isArray(n.children)) {
        for (const child of n.children) walk(child);
      }
      if (Array.isArray(n.content)) {
        for (const child of n.content) walk(child);
      }
    }
    if (Array.isArray(doc)) {
      for (const node of doc) walk(node);
    } else {
      walk(doc);
    }
    return texts.join(' ');
  } catch {
    return '';
  }
}

function sanitizeName(value: string): string {
  return value
    .replace(/\.[^.]+$/, '')
    .trim()
    .replace(/[^a-zA-Z0-9가-힣._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'lora';
}

function buildOutputDir(name: string): string {
  const slug = sanitizeName(name);
  return path.join(
    process.cwd(),
    'loras',
    'library',
    `${slug}-${crypto.randomUUID().slice(0, 8)}`
  );
}

function getOverallProgress(progress: number, jobIndex: number, totalJobs: number): number {
  if (totalJobs <= 1) {
    return progress;
  }
  const clamped = Math.max(0, Math.min(progress, 100));
  return Math.min(99, Math.floor(((jobIndex + clamped / 100) / totalJobs) * 100));
}

function isCancelRequested(projectId: string): boolean {
  return readTrainingStatus(projectId).cancelRequestedAt !== null;
}

type TrainingJob = {
  content: string;
  fileName: string | null;
  loraName: string;
  sourceDescription: string;
  outputDir: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = (await req.json()) as {
    name?: string;
    textContent?: string;
    textContents?: string[];
    textFileNames?: string[];
    model?: string;
    epochs?: number;
    seqLength?: number;
    loraR?: number;
    loraAlpha?: number;
    learningRate?: number;
  };

  const loraName =
    body.name?.trim() || `LoRA ${new Date().toLocaleDateString('ko-KR')}`;

  // Collect training texts: textContents[] (multi-file) > textContent (single) > chapters
  const inputTexts: string[] = [];

  if (body.textContents?.length) {
    for (const t of body.textContents) {
      const trimmed = t.trim();
      if (trimmed) inputTexts.push(trimmed);
    }
  } else if (body.textContent?.trim()) {
    inputTexts.push(body.textContent.trim());
  } else {
    const chapterRows = await listChapters(db, projectId);
    const chapText = chapterRows
      .map((ch) => extractPlainText(ch.contentJson))
      .join('\n\n')
      .trim();
    if (chapText) inputTexts.push(chapText);
  }

  if (inputTexts.length === 0) {
    return new Response(JSON.stringify({ error: '소설 텍스트 없음' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lockResult = acquireTrainingLock(projectId);
  if (!lockResult.ok) {
    const holder = lockResult.lock;
    return new Response(
      JSON.stringify({
        error: holder
          ? `다른 QLoRA 학습이 진행 중입니다. (${holder.projectId})`
          : '다른 QLoRA 학습이 진행 중입니다.',
      }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const jobs: TrainingJob[] = inputTexts.map((text, index) => {
    const fileName = body.textFileNames?.[index]?.trim() || null;
    const perFileName =
      inputTexts.length > 1
        ? sanitizeName(fileName || `${loraName}-${index + 1}`)
        : loraName;
    const sourceDescription = fileName
      ? `업로드된 텍스트 · ${fileName}`
      : body.textContents?.length
        ? `업로드된 텍스트 (${index + 1}/${inputTexts.length})`
        : body.textContent?.trim()
          ? '업로드된 텍스트'
          : '소설 챕터';

    return {
      content: text,
      fileName,
      loraName: perFileName,
      sourceDescription,
      outputDir: buildOutputDir(perFileName),
    };
  });

  const runnerScript = path.join(process.cwd(), 'scripts', 'qlora_trainer.py');
  const pythonExecutable = getQloraPythonPath();
  const hfToken = getHuggingFaceToken();
  const baseModel = body.model || getQloraBaseModel();

  const spawnEnv = {
    ...process.env,
    ...(hfToken ? { HUGGING_FACE_HUB_TOKEN: hfToken, HF_TOKEN: hfToken } : {}),
    // Training uses both GPUs and must not inherit inference-only pinning.
    CUDA_VISIBLE_DEVICES: process.env.QLORA_TRAIN_CUDA_DEVICES ?? '0,1',
    QWEN_INFERENCE_GPU: '',
    QWEN_INFERENCE_GPU_UUID: '',
  };

  // Stop inference server + evict ollama to free GPU VRAM for training
  await freeGpuForTraining();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let controllerClosed = false;
      function safeEnqueue(data: string) {
        if (controllerClosed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          controllerClosed = true;
        }
      }
      function safeClose() {
        if (controllerClosed) return;
        try {
          controller.close();
        } catch {
          // already closed
        }
        controllerClosed = true;
      }
      void (async () => {
        startTrainingStatus(projectId, '학습 작업을 시작하는 중...');
        let lastOutput: string | null = null;
        let lastCreatedLoraId: string | null = null;

        try {
          for (let index = 0; index < jobs.length; index++) {
            if (isCancelRequested(projectId)) {
              throw new Error(TRAINING_CANCELLED_CODE);
            }

            const job = jobs[index];
            const prefix = jobs.length > 1 ? `[${index + 1}/${jobs.length}] ${job.loraName} · ` : '';
            const tmpPath = path.join(os.tmpdir(), `novel_${projectId}_${index}_${Date.now()}.txt`);
            fs.writeFileSync(tmpPath, job.content, 'utf-8');

            const spawnArgs = [
              runnerScript,
              '--input', tmpPath,
              '--output', job.outputDir,
              '--model', baseModel,
              ...(body.epochs ? ['--epochs', String(body.epochs)] : []),
              ...(body.seqLength ? ['--seq-length', String(body.seqLength)] : []),
              ...(body.loraR ? ['--lora-r', String(body.loraR)] : []),
              ...(body.loraAlpha ? ['--lora-alpha', String(body.loraAlpha)] : []),
              ...(body.learningRate ? ['--learning-rate', String(body.learningRate)] : []),
            ];

            await new Promise<void>((resolve, reject) => {
              const proc = spawn(pythonExecutable, spawnArgs, {
                env: spawnEnv,
                detached: true,
              });
              updateTrainingStatus(projectId, {
                running: true,
                stage: 'loading',
                progress: getOverallProgress(0, index, jobs.length),
                message: `${prefix}학습 프로세스를 준비하는 중...`,
                error: null,
                finishedAt: null,
                trainingPid: proc.pid ?? null,
                cancelRequestedAt: null,
              });
              updateTrainingLock({ trainingPid: proc.pid ?? null });
              let buffer = '';
              const creationPromises: Promise<void>[] = [];

              proc.stdout.on('data', (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const parsed = JSON.parse(line) as {
                      stage: string;
                      progress: number;
                      message: string;
                      output?: string;
                    };

                    const overallMessage = `${prefix}${parsed.message}`;
                    const overallProgress =
                      parsed.stage === 'done'
                        ? Math.floor(((index + 1) / jobs.length) * 100)
                        : getOverallProgress(parsed.progress, index, jobs.length);

                    safeEnqueue(
                      `data: ${JSON.stringify({
                        ...parsed,
                        progress: overallProgress,
                        message: overallMessage,
                      })}\n\n`
                    );

                    updateTrainingStatus(projectId, {
                      running: true,
                      stage: parsed.stage as
                        | 'loading'
                        | 'tokenizing'
                        | 'training'
                        | 'saving'
                        | 'done'
                        | 'error',
                      progress: overallProgress,
                      message: overallMessage,
                      output: parsed.output ?? lastOutput,
                      error: parsed.stage === 'error' ? overallMessage : null,
                      finishedAt: null,
                      trainingPid: proc.pid ?? null,
                    });

                    if (parsed.stage === 'done' && parsed.output) {
                      lastOutput = parsed.output;
                      creationPromises.push(
                        Promise.resolve(
                          createLora(db, {
                            projectId,
                            name: job.loraName,
                            filePath: parsed.output,
                            sourceDescription: job.sourceDescription,
                          })
                        ).then((created) => {
                          if (created) {
                            lastCreatedLoraId = created.id;
                          }
                        })
                      );
                    }
                  } catch (parseErr) {
                    // non-JSON stdout line — skip (but log unexpected errors)
                    if (parseErr instanceof SyntaxError) continue;
                    console.error('[lora-generate] stdout processing error:', parseErr);
                  }
                }
              });

              proc.stderr.on('data', (chunk: Buffer) => {
                const msg = chunk.toString().trim();
                if (!msg) return;
                const overallMessage = `${prefix}${msg}`;
                appendTrainingLog(projectId, overallMessage);
                safeEnqueue(
                  `data: ${JSON.stringify({ stage: 'log', progress: -1, message: overallMessage })}\n\n`
                );
              });

              proc.on('error', (error) => {
                reject(error);
              });

              proc.on('close', (code: number | null) => {
                try {
                  fs.rmSync(tmpPath, { force: true });
                } catch {
                  // ignore
                }
                if (isCancelRequested(projectId)) {
                  reject(new Error(TRAINING_CANCELLED_CODE));
                  return;
                }
                if (code !== 0) {
                  reject(new Error(`${prefix}프로세스 종료: ${code ?? 'null'}`));
                  return;
                }
                Promise.all(creationPromises)
                  .then(() => resolve())
                  .catch(reject);
              });

              proc.unref();
            });
          }

          if (lastCreatedLoraId) {
            await setActiveLora(db, projectId, lastCreatedLoraId);
          }

          const finalMessage =
            jobs.length > 1
              ? `${jobs.length}개 LoRA 생성 완료`
              : 'QLoRA 학습 완료! 라이브러리에 추가되었습니다.';

          updateTrainingStatus(projectId, {
            running: false,
            stage: 'done',
            progress: 100,
            message: finalMessage,
            output: lastOutput,
            error: null,
            logs: [],
            finishedAt: new Date().toISOString(),
            trainingPid: null,
            cancelRequestedAt: null,
          });
          safeEnqueue(
            `data: ${JSON.stringify({ stage: 'done', progress: 100, message: finalMessage, output: lastOutput })}\n\n`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const cancelled = message === TRAINING_CANCELLED_CODE || isCancelRequested(projectId);
          updateTrainingStatus(projectId, {
            running: false,
            stage: cancelled ? 'cancelled' : 'error',
            progress: 0,
            message: cancelled ? '학습이 취소되었습니다.' : message,
            error: cancelled ? null : message,
            finishedAt: new Date().toISOString(),
            trainingPid: null,
          });
          safeEnqueue(
            `data: ${JSON.stringify({ stage: cancelled ? 'cancelled' : 'error', progress: 0, message: cancelled ? '학습이 취소되었습니다.' : message })}\n\n`
          );
        } finally {
          releaseTrainingLock();
          safeClose();
          restartServerAfterTraining(lastOutput ? path.dirname(lastOutput) : undefined);
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
