/*
 * Copyright 2026 The Ray Optics Simulation authors and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createZemaxLibraryRecord, decodeZemaxBuffer } from '../utils/zemaxImport.js';

const DB_NAME = 'rayOpticsZemaxLibrary';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

function getIndexedDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this environment.');
  }
  return indexedDB;
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

async function openDatabase() {
  const request = getIndexedDb().open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
  };
  return promisifyRequest(request);
}

async function withStore(mode, callback) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await callback(store);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    });
    return result;
  } finally {
    database.close();
  }
}

export function isZemaxLibrarySupported() {
  return typeof indexedDB !== 'undefined';
}

export async function listZemaxLibraryEntries() {
  return withStore('readonly', async (store) => {
    const entries = await promisifyRequest(store.getAll());
    return (entries || []).sort((left, right) => {
      return `${right.updatedAt || ''}`.localeCompare(`${left.updatedAt || ''}`);
    });
  });
}

export async function putZemaxLibraryEntry(entry) {
  return withStore('readwrite', async (store) => {
    await promisifyRequest(store.put(entry));
    return entry;
  });
}

export async function deleteZemaxLibraryEntry(id) {
  return withStore('readwrite', async (store) => {
    await promisifyRequest(store.delete(id));
  });
}

export async function importZemaxArrayBufferToLibrary({ arrayBuffer, fileName }) {
  const existingEntries = await listZemaxLibraryEntries();
  const sourceText = decodeZemaxBuffer(arrayBuffer);
  const record = createZemaxLibraryRecord({
    fileName,
    sourceText,
    existingModuleNames: existingEntries.map((entry) => entry.moduleName),
  });
  await putZemaxLibraryEntry(record);
  return record;
}
