import { PlotBoard } from '@/components/plot/plot-board';

export default async function PlotBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlotBoard projectId={id} />;
}
