import {
  createDefaultPhysicsProfile,
  mergePhysicsProfile,
  type PhysicsProfilePatch,
} from '../model/physicsProfile';
import type { LoadedDesign, PhysicsProfile, StoredDesign, StoredDesignMetadata } from '../model/types';
import type { BattleResult } from '../simulation/types';

const DATABASE_NAME = 'beyblade-simulator';
const DATABASE_VERSION = 3;
const DESIGN_STORE_NAME = 'designs';
const BATTLE_RESULT_STORE_NAME = 'battleResults';
const UPDATED_AT_INDEX_NAME = 'updatedAt';
const CREATED_AT_INDEX_NAME = 'createdAt';

type StoredDesignRecord = Omit<StoredDesign, 'physicsProfile'> & {
  physicsProfile?: PhysicsProfile;
};

export async function listStoredDesigns(): Promise<StoredDesignMetadata[]> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(DESIGN_STORE_NAME, 'readonly');
    const store = transaction.objectStore(DESIGN_STORE_NAME);
    const index = store.index(UPDATED_AT_INDEX_NAME);
    const records = await collectFromCursor<StoredDesignRecord>(index.openCursor(null, 'prev'));

    return records.map(ensureStoredDesign).map(toStoredDesignMetadata);
  } finally {
    database.close();
  }
}

export async function getStoredDesign(id: string): Promise<StoredDesign | undefined> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(DESIGN_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DESIGN_STORE_NAME);
    const done = transactionDone(transaction);
    const record = await requestToPromise<StoredDesignRecord | undefined>(store.get(id));

    if (!record) {
      await done;
      return undefined;
    }

    const storedDesign = ensureStoredDesign(record);

    if (needsPhysicsProfileBackfill(record)) {
      await requestToPromise(store.put(storedDesign));
    }

    await done;

    return storedDesign;
  } finally {
    database.close();
  }
}

export async function getPhysicsProfile(designId: string): Promise<PhysicsProfile> {
  const storedDesign = await getStoredDesign(designId);

  if (!storedDesign) {
    throw new Error('This saved design no longer exists.');
  }

  return storedDesign.physicsProfile;
}

export async function saveStoredDesign(
  design: LoadedDesign,
  fileBlob: Blob,
  displayName: string,
): Promise<StoredDesignMetadata> {
  const now = new Date().toISOString();
  const storedDesign: StoredDesign = {
    id: design.id,
    displayName: sanitizeDisplayName(displayName),
    fileName: design.fileName,
    fileType: design.fileType,
    fileSizeBytes: design.fileSizeBytes,
    sourceUpAxis: design.sourceUpAxis,
    fileBlob,
    thumbnailDataUrl: design.thumbnailDataUrl,
    rawDimensions: design.rawDimensions,
    normalizedDimensions: design.normalizedDimensions,
    scaleFactor: design.scaleFactor,
    physicsProfile: createDefaultPhysicsProfile(design, now),
    createdAt: now,
    updatedAt: now,
  };

  const database = await openDatabase();

  try {
    const transaction = database.transaction(DESIGN_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DESIGN_STORE_NAME);
    const done = transactionDone(transaction);
    await requestToPromise(store.put(storedDesign));
    await done;

    return toStoredDesignMetadata(storedDesign);
  } finally {
    database.close();
  }
}

export async function renameStoredDesign(
  id: string,
  displayName: string,
): Promise<StoredDesignMetadata> {
  const sanitizedName = sanitizeDisplayName(displayName);
  const database = await openDatabase();

  try {
    const transaction = database.transaction(DESIGN_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DESIGN_STORE_NAME);
    const done = transactionDone(transaction);
    const record = await requestToPromise<StoredDesign | undefined>(store.get(id));

    if (!record) {
      throw new Error('This saved design no longer exists.');
    }

    const updatedRecord: StoredDesign = {
      ...record,
      displayName: sanitizedName,
      updatedAt: new Date().toISOString(),
    };

    await requestToPromise(store.put(updatedRecord));
    await done;

    return toStoredDesignMetadata(updatedRecord);
  } finally {
    database.close();
  }
}

export async function updatePhysicsProfile(
  id: string,
  profilePatch: PhysicsProfilePatch,
): Promise<StoredDesignMetadata> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(DESIGN_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DESIGN_STORE_NAME);
    const done = transactionDone(transaction);
    const record = await requestToPromise<StoredDesignRecord | undefined>(store.get(id));

    if (!record) {
      throw new Error('This saved design no longer exists.');
    }

    const storedDesign = ensureStoredDesign(record);
    const now = new Date().toISOString();
    const updatedRecord: StoredDesign = {
      ...storedDesign,
      physicsProfile: mergePhysicsProfile(storedDesign, storedDesign.physicsProfile, profilePatch, now),
      updatedAt: now,
    };

    await requestToPromise(store.put(updatedRecord));
    await done;

    return toStoredDesignMetadata(updatedRecord);
  } finally {
    database.close();
  }
}

export async function deleteStoredDesign(id: string): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(DESIGN_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DESIGN_STORE_NAME);
    const done = transactionDone(transaction);
    await requestToPromise(store.delete(id));
    await done;
  } finally {
    database.close();
  }
}

export async function saveBattleResult(result: Omit<BattleResult, 'id' | 'createdAt'>): Promise<BattleResult> {
  const storedResult: BattleResult = {
    ...result,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const database = await openDatabase();

  try {
    const transaction = database.transaction(BATTLE_RESULT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BATTLE_RESULT_STORE_NAME);
    const done = transactionDone(transaction);
    await requestToPromise(store.put(storedResult));
    await done;

    return storedResult;
  } finally {
    database.close();
  }
}

export async function listBattleResults(limit = 20): Promise<BattleResult[]> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(BATTLE_RESULT_STORE_NAME, 'readonly');
    const store = transaction.objectStore(BATTLE_RESULT_STORE_NAME);
    const index = store.index(CREATED_AT_INDEX_NAME);
    const records = await collectFromCursor<BattleResult>(index.openCursor(null, 'prev'), limit);

    return records;
  } finally {
    database.close();
  }
}

export async function deleteBattleResult(id: string): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(BATTLE_RESULT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BATTLE_RESULT_STORE_NAME);
    const done = transactionDone(transaction);
    await requestToPromise(store.delete(id));
    await done;
  } finally {
    database.close();
  }
}

export function getDefaultDisplayName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return sanitizeDisplayName(withoutExtension);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener('upgradeneeded', (event) => {
      const database = request.result;
      const store = database.objectStoreNames.contains(DESIGN_STORE_NAME)
        ? request.transaction?.objectStore(DESIGN_STORE_NAME)
        : database.createObjectStore(DESIGN_STORE_NAME, { keyPath: 'id' });

      if (store && !store.indexNames.contains(UPDATED_AT_INDEX_NAME)) {
        store.createIndex(UPDATED_AT_INDEX_NAME, 'updatedAt');
      }

      if (store && event.oldVersion < 2) {
        backfillPhysicsProfiles(store);
      }

      if (!database.objectStoreNames.contains(BATTLE_RESULT_STORE_NAME)) {
        const battleResultStore = database.createObjectStore(BATTLE_RESULT_STORE_NAME, { keyPath: 'id' });
        battleResultStore.createIndex(CREATED_AT_INDEX_NAME, 'createdAt');
      } else {
        const battleResultStore = request.transaction?.objectStore(BATTLE_RESULT_STORE_NAME);

        if (battleResultStore && !battleResultStore.indexNames.contains(CREATED_AT_INDEX_NAME)) {
          battleResultStore.createIndex(CREATED_AT_INDEX_NAME, 'createdAt');
        }
      }
    });

    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(new Error('Unable to open the local design library.')));
    request.addEventListener('blocked', () => reject(new Error('The local design library is blocked by another tab.')));
  });
}

function backfillPhysicsProfiles(store: IDBObjectStore): void {
  const cursorRequest = store.openCursor();

  cursorRequest.addEventListener('success', () => {
    const cursor = cursorRequest.result;

    if (!cursor) {
      return;
    }

    const record = cursor.value as StoredDesignRecord;

    if (needsPhysicsProfileBackfill(record)) {
      void cursor.update(ensureStoredDesign(record));
    }

    cursor.continue();
  });
}

function collectFromCursor<T>(request: IDBRequest<IDBCursorWithValue | null>, limit = Number.POSITIVE_INFINITY): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const records: T[] = [];

    request.addEventListener('success', () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(records);
        return;
      }

      records.push(cursor.value as T);

      if (records.length >= limit) {
        resolve(records);
        return;
      }

      cursor.continue();
    });

    request.addEventListener('error', () => reject(new Error('Unable to read saved designs.')));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(new Error('A local design library operation failed.')));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(new Error('The local design library operation was aborted.')));
    transaction.addEventListener('error', () => reject(new Error('The local design library operation failed.')));
  });
}

function sanitizeDisplayName(displayName: string): string {
  const sanitizedName = displayName.trim().slice(0, 80);

  if (!sanitizedName) {
    throw new Error('Design name must not be empty.');
  }

  return sanitizedName;
}

function ensureStoredDesign(design: StoredDesignRecord): StoredDesign {
  const physicsProfile = mergePhysicsProfile(
    design,
    design.physicsProfile,
    {},
    design.physicsProfile?.updatedAt ?? design.updatedAt,
  );

  return {
    ...design,
    physicsProfile,
  };
}

function needsPhysicsProfileBackfill(design: StoredDesignRecord): boolean {
  return !design.physicsProfile || !design.physicsProfile.contactProfile;
}

function toStoredDesignMetadata(design: StoredDesign): StoredDesignMetadata {
  const { fileBlob: _fileBlob, ...metadata } = design;
  return metadata;
}
