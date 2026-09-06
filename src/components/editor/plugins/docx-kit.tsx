'use client';

import { DocxPlugin } from '@platejs/docx';

// DOCX parsing changes the editor's plugin graph and must be registered at
// creation time. The much heavier Juice CSS inliner is imported on demand by
// optional-word-paste.ts when rich clipboard HTML actually needs it.
export const DocxKit = [DocxPlugin];
