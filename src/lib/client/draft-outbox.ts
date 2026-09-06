const DATABASE_NAME = 'muse-novel-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'draft-outbox';

export interface DraftOutboxRecord {
  id: string;
  projectId: string;
  chapterId: string;
  content: string;
  updatedAt: number;
}

export type DraftStorage = 'indexeddb' | 'localstorage' | 'unavailable';

let databasePromise: Promise<IDBDatabase> | null = null;

export function draftOutboxId(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

function backupKey(chapterId: string): string {
  // Keep the existing key so browsers without IndexedDB can still use the
  // current recovery UI.
  return `muse-novel-backup-${chapterId}`;
}

function getIndexedDb(): IDBFactory | null {
  if (typeof indexedDB === 'undefined') return null;
  return indexedDB;
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  const factory = getIndexedDb();
  if (!factory) return Promise.reject(new Error('indexeddb_unavailable'));

  databasePromise = new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('indexeddb_open_failed'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('indexeddb_open_blocked'));
    };
  });

  return databasePromise;
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('indexeddb_transaction_failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('indexeddb_transaction_aborted'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('indexeddb_request_failed'));
  });
}

function storeLocalBackup(chapterId: string, content: string): boolean {
  try {
    localStorage.setItem(backupKey(chapterId), content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Leave a synchronous recovery copy before the page is backgrounded or
 * discarded. IndexedDB transactions cannot be awaited during pagehide, while
 * localStorage is synchronous and gives the next visit a last-resort draft.
 */
export function storeDraftOutboxRecoveryCopy(
  record: DraftOutboxRecord
): boolean {
  return storeLocalBackup(record.chapterId, record.content);
}

function readLocalBackup(
  projectId: string,
  chapterId: string
): DraftOutboxRecord | null {
  try {
    const content = localStorage.getItem(backupKey(chapterId));
    if (content === null) return null;
    return {
      id: draftOutboxId(projectId, chapterId),
      projectId,
      chapterId,
      content,
      updatedAt: 0,
    };
  } catch {
    return null;
  }
}

function clearMatchingLocalBackup(
  chapterId: string,
  expectedContent: string
): void {
  try {
    const key = backupKey(chapterId);
    if (localStorage.getItem(key) === expectedContent) {
      localStorage.removeItem(key);
    }
  } catch {
    // The server save is still valid when browser storage is unavailable.
  }
}

export async function putDraftOutbox(
  record: DraftOutboxRecord
): Promise<DraftStorage> {
  if (getIndexedDb()) {
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const completion = transactionCompletion(transaction);
      transaction.objectStore(STORE_NAME).put(record);
      await completion;

      // IndexedDB is the source of truth. Remove a stale legacy fallback so it
      // cannot later be mistaken for the newest draft.
      try {
        localStorage.removeItem(backupKey(record.chapterId));
      } catch {
        // Ignore localStorage restrictions when IndexedDB succeeded.
      }
      return 'indexeddb';
    } catch {
      // Private browsing modes and quota errors can expose IndexedDB but reject
      // writes. Fall back to the legacy local backup in that case.
    }
  }

  return storeLocalBackup(record.chapterId, record.content)
    ? 'localstorage'
    : 'unavailable';
}

export async function readDraftOutbox(
  projectId: string,
  chapterId: string
): Promise<DraftOutboxRecord | null> {
  if (getIndexedDb()) {
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction
        .objectStore(STORE_NAME)
        .get(draftOutboxId(projectId, chapterId));
      const record = await requestResult(
        request as IDBRequest<DraftOutboxRecord | undefined>
      );
      if (record) return record;
    } catch {
      // A localStorage draft may still be available after an IndexedDB failure.
    }
  }

  return readLocalBackup(projectId, chapterId);
}

export async function clearDraftOutboxIfMatching(
  projectId: string,
  chapterId: string,
  expectedContent: string
): Promise<void> {
  if (getIndexedDb()) {
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const completion = transactionCompletion(transaction);
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(draftOutboxId(projectId, chapterId));
      const record = await requestResult(
        request as IDBRequest<DraftOutboxRecord | undefined>
      );

      if (record?.content === expectedContent) {
        store.delete(record.id);
      }
      await completion;
    } catch {
      // A successful server save must not become an error just because cleanup
      // of the browser-side outbox failed.
    }
  }

  clearMatchingLocalBackup(chapterId, expectedContent);
}
