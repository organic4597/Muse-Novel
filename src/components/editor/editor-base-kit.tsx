import { BaseAlignKit } from './plugins/align-base-kit';
import { BaseBasicBlocksKit } from './plugins/basic-blocks-base-kit';
import { BaseBasicMarksKit } from './plugins/basic-marks-base-kit';
import { BaseCalloutKit } from './plugins/callout-base-kit';
import { BaseFontKit } from './plugins/font-base-kit';
import { BaseLineHeightKit } from './plugins/line-height-base-kit';
import { BaseLinkKit } from './plugins/link-base-kit';
import { BaseListKit } from './plugins/list-base-kit';
import { MarkdownKit } from './plugins/markdown-kit';
import { BaseMentionKit } from './plugins/mention-base-kit';

export const BaseEditorKit = [
  ...BaseBasicBlocksKit,
  ...BaseCalloutKit,
  ...BaseLinkKit,
  ...BaseMentionKit,
  ...BaseBasicMarksKit,
  ...BaseFontKit,
  ...BaseListKit,
  ...BaseAlignKit,
  ...BaseLineHeightKit,
  ...MarkdownKit,
];
