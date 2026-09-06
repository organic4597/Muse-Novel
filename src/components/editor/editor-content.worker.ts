import {
  type EditorContentWorkerRequest,
  type EditorContentWorkerResponse,
  processEditorContent,
} from './editor-content-worker-core';

type EditorWorkerScope = {
  onmessage: ((event: MessageEvent<EditorContentWorkerRequest>) => void) | null;
  postMessage: (message: EditorContentWorkerResponse) => void;
};

const workerScope = globalThis as unknown as EditorWorkerScope;

workerScope.onmessage = (event) => {
  const { requestId, value } = event.data;

  try {
    workerScope.postMessage({
      requestId,
      result: processEditorContent(value),
      success: true,
    });
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : '편집기 내용을 처리하지 못했습니다.',
      requestId,
      success: false,
    });
  }
};
