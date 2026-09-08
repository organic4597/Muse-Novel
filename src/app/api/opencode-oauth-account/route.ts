import { beginOpenCodeOAuth, disconnectOpenCodeOAuth, getOpenCodeOAuthState } from '@/lib/ai/opencode-oauth';

export async function GET() {
  return Response.json(await getOpenCodeOAuthState(), { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST() {
  try { return Response.json(await beginOpenCodeOAuth(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'OpenCode 방식의 ChatGPT 로그인을 시작하지 못했습니다.' }, { status: 503 });
  }
}
export async function DELETE() {
  try { return Response.json(await disconnectOpenCodeOAuth(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: '연결을 해제하지 못했습니다.' }, { status: 503 }); }
}
