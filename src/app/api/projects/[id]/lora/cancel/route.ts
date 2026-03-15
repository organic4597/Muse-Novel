import { readTrainingLock } from '@/lib/ai/qlora-training-lock';
import { readTrainingStatus, requestTrainingCancel } from '@/lib/ai/qlora-training-status';

function terminateProcess(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
  }

  setTimeout(() => {
    try {
      process.kill(-pid, 0);
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch {
        // already stopped
      }
    }
  }, 3000);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const status = readTrainingStatus(projectId);
  const lock = readTrainingLock();

  if (!status.running) {
    return Response.json(status, { status: 200 });
  }

  if (status.trainingPid) {
    terminateProcess(status.trainingPid);
  } else if (lock?.trainingPid) {
    terminateProcess(lock.trainingPid);
  }

  const cancelled = requestTrainingCancel(projectId, '사용자가 학습을 취소했습니다.');
  return Response.json(cancelled, { status: 200 });
}