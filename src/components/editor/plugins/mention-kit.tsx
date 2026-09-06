'use client';

import { MentionInputPlugin, MentionPlugin } from '@platejs/mention/react';

import {
  MentionElement,
  MentionInputElement,
} from '@/components/ui/mention-node';

export const MentionKit = [
  MentionPlugin.configure({
    options: { triggerPreviousCharPattern: /^$|^[\s"'ㄱ-ㅎㅏ-ㅣ가-힣]$/ },
  }).withComponent(MentionElement),
  MentionInputPlugin.withComponent(MentionInputElement),
];
