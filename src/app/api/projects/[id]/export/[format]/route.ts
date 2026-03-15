import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { listChapters } from '@/lib/db/queries/chapters';
import { getProject } from '@/lib/db/queries/projects';
import { generateEpub } from '@/lib/export/export-epub';
import { convertToMarkdown } from '@/lib/export/export-md';
import { convertToPlainText } from '@/lib/export/export-text';

/**
 * GET /api/projects/[id]/export/[format]
 * Export project to plain text or markdown
 *
 * @param format - 'txt' or 'md'
 */
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; format: string }> }
) {
  const { id, format } = await params;

  // Validate format
  if (format !== 'txt' && format !== 'md' && format !== 'epub') {
    return NextResponse.json(
      { error: '지원하지 않는 형식입니다.' },
      { status: 400 }
    );
  }

  // Get project
  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json(
      { error: '프로젝트를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  // Get all chapters ordered by order ASC
  const chapters = await listChapters(db, id);

  // Determine file extension and content type
  // Handle EPUB format separately
  if (format === 'epub') {
    const epubBuffer = await generateEpub(
      { title: project.title },
      chapters.map((ch) => ({ title: ch.title, contentJson: ch.contentJson }))
    );
    return new NextResponse(new Uint8Array(epubBuffer), {
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="export.epub"; filename*=UTF-8''${encodeURIComponent(project.title)}.epub`,
      },
    });
  }

  const ext = format === 'txt' ? 'txt' : 'md';
  const contentType =
    format === 'txt'
      ? 'text/plain; charset=utf-8'
      : 'text/markdown; charset=utf-8';

  // Convert each chapter and concatenate
  const chapterContents = chapters.map((chapter) => {
    // Parse contentJson if it exists
    let contentJson = null;
    if (chapter.contentJson) {
      try {
        contentJson = JSON.parse(chapter.contentJson);
      } catch {
        // If parsing fails, skip content
      }
    }

    // Convert content to appropriate format
    let content = '';
    if (format === 'txt') {
      content = convertToPlainText(contentJson);
    } else {
      content = convertToMarkdown(contentJson);
    }

    // Build chapter section with title
    const lines: string[] = [];

    // Add chapter title
    if (format === 'txt') {
      lines.push(chapter.title);
    } else {
      // Use h2 for chapter titles in markdown
      lines.push(`## ${chapter.title}`);
    }

    if (content) {
      lines.push(content);
    }

    return lines.join('\n');
  });

  // Join all chapters with separator
  const finalContent = chapterContents.join('\n\n');

  // Create filename with UTF-8 support
  // Use encodeURI to handle Korean characters
  const filename = `${project.title}.${ext}`;
  const safeFilename = `export.${ext}`;

  // Return as file download
  return new NextResponse(finalContent, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,

    },
  });
}
