import { cancelJob, getJob } from '@/lib/image-gen/image-gen-queue';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE — Cancel a pending queue job.
 * Returns: { success: true } or { error: string }
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = getJob(jobId);
  if (!job) {
    return json({ error: '작업을 찾을 수 없습니다.' }, 404);
  }

  if (job.status !== 'pending') {
    return json({ error: 'pending 상태의 작업만 취소할 수 있습니다.' }, 409);
  }

  const cancelled = cancelJob(jobId);
  if (!cancelled) {
    return json({ error: '취소에 실패했습니다.' }, 500);
  }

  return json({ success: true });
}
