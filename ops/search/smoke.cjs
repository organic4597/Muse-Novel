// Run inside the Muse Novel image from /app. Uses the real inference/search APIs;
// the story-planning route only returns a draft and does not save any project data.
const path = require('node:path');
const { routeModule } = require(path.join(process.cwd(), '.next/server/app/api/story-planning/chat/route.js'));

async function main() {
  const started = Date.now();
  const response = await routeModule.userland.POST(new Request('http://localhost/api/story-planning/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      webSearchMode: 'always',
      messages: [{ role: 'user', content: '공청석유의 장르상 의미를 웹 자료로 찾아 두 문장으로 설명해줘. 새 인물이나 설정 후보는 만들지 마.' }],
      draft: { genre: '무협', currentPhase: 'world', characters: [], worldEntries: [] },
    }),
    signal: AbortSignal.timeout(600_000),
  }));
  if (!response.ok) throw new Error(`Route returned ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      const event = block.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
      const raw = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (event === 'status') console.log(JSON.stringify({ seconds: (Date.now() - started) / 1000, message: data.message }));
      if (event === 'error') throw new Error(data.message || data.error);
      if (event === 'done') {
        completed = true;
        console.log(JSON.stringify({
          seconds: (Date.now() - started) / 1000,
          status: data.research?.status,
          queries: data.research?.queries,
          sources: data.research?.sources?.map(({ title, url }) => ({ title, url })),
          replyPreview: data.reply?.slice(0, 500),
          warning: data.research?.warning,
        }));
        if (data.research?.status !== 'searched' || !data.research.sources.length) throw new Error('No verified search results in response');
      }
    }
    if (done) break;
  }
  if (!completed) throw new Error('Stream ended without completion');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
