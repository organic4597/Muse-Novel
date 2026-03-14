import { stat } from 'fs/promises';
import path from 'path';
import { getLoraRegistry } from '@/lib/image-gen/lora-registry';

export async function GET() {
  const registry = await getLoraRegistry();

  // Check which files actually exist on disk
  const lorasDir = path.join(process.cwd(), 'data', 'loras');
  const entries = await Promise.all(
    registry.map(async (entry) => {
      const filePath = path.join(lorasDir, entry.filename);
      let downloaded = false;
      let fileSize = 0;
      try {
        const s = await stat(filePath);
        // Consider downloaded if file exists and is > 1MB (not a partial/error response)
        downloaded = s.size > 1_000_000;
        fileSize = s.size;
      } catch {
        // file doesn't exist
      }
      return { ...entry, downloaded, fileSize };
    })
  );

  return Response.json(entries);
}
