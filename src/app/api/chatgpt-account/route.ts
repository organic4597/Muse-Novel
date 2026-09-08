import { beginChatGPTLogin, disconnectChatGPT, getChatGPTAccount, getChatGPTConnectionError } from '@/lib/ai/chatgpt-account';

export async function GET() {
  return Response.json(await getChatGPTAccount(), { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST() {
  try { return Response.json(await beginChatGPTLogin(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json(getChatGPTConnectionError(error), { status: 503 }); }
}
export async function DELETE() {
  try { return Response.json(await disconnectChatGPT(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: '연결 해제를 완료하지 못했습니다. 다시 시도해주세요.' }, { status: 503 }); }
}
