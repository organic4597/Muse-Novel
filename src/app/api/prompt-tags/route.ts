import { readFile } from 'fs/promises';
import path from 'path';
import { getLoraRegistry } from '@/lib/image-gen/lora-registry';

interface TagCategory {
  id: string;
  label: string;
  color: string;
  tags: string[];
}

interface TagDB {
  categories: TagCategory[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').toLowerCase().trim();
  const categoryFilter = searchParams.get('cat') ?? '';

  // Load tag database
  const tagDbPath = path.join(process.cwd(), 'config', 'prompt-tags.json');
  const raw = await readFile(tagDbPath, 'utf-8');
  const tagDb: TagDB = JSON.parse(raw);

  // Load LoRA trigger words
  const loraRegistry = await getLoraRegistry();
  const loraTriggers: TagCategory = {
    id: 'lora_trigger',
    label: 'LoRA 트리거',
    color: '#d946ef',
    tags: loraRegistry.flatMap((l) =>
      l.triggerWords.map((tw) => tw)
    ),
  };

  const allCategories = [...tagDb.categories, loraTriggers];

  // Browse specific category — return all its tags
  if (categoryFilter) {
    const cat = allCategories.find((c) => c.id === categoryFilter);
    if (!cat) return Response.json([]);
    return Response.json(
      cat.tags.map((t) => ({
        tag: t,
        category: cat.id,
        categoryLabel: cat.label,
        color: cat.color,
      }))
    );
  }

  if (!query) {
    // Return category list with tag counts
    return Response.json(
      allCategories.map((c) => ({
        id: c.id,
        label: c.label,
        color: c.color,
        count: c.tags.length,
        tags: c.tags.slice(0, 20),
      }))
    );
  }

  // Search tags matching query
  const results: { tag: string; category: string; categoryLabel: string; color: string }[] = [];

  for (const cat of allCategories) {
    for (const tag of cat.tags) {
      if (tag.toLowerCase().includes(query)) {
        results.push({
          tag,
          category: cat.id,
          categoryLabel: cat.label,
          color: cat.color,
        });
      }
      if (results.length >= 50) break;
    }
    if (results.length >= 50) break;
  }

  // Sort: exact prefix match first, then by length
  results.sort((a, b) => {
    const aPrefix = a.tag.toLowerCase().startsWith(query) ? 0 : 1;
    const bPrefix = b.tag.toLowerCase().startsWith(query) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.tag.length - b.tag.length;
  });

  return Response.json(results);
}
