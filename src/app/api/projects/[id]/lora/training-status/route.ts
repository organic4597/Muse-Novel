import { readTrainingStatus } from '@/lib/ai/qlora-training-status';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  return Response.json(readTrainingStatus(projectId));
}