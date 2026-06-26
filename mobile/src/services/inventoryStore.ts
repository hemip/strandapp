import RNFS from 'react-native-fs';
import {createPlotFileBase} from './namingService';
import {
  deleteFileIfExists,
  publicPaths,
  readJsonFile,
  sanitizePathSegment,
  writeJsonFile,
} from './publicFileService';

export type InventoryStatus = 'pågående' | 'inskickad';

export interface InventoryListItem {
  id: string;
  ruta: string;
  provyta: string;
  pyid?: string;
  status: InventoryStatus;
  updatedAt: string;
  exportedAt?: string;
}

const inventoryIndexPath = `${publicPaths.dataDir}/inventeringar.json`;

function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function getDraftPath(inventoryId: string) {
  return `${publicPaths.dataDir}/${sanitizePathSegment(inventoryId)}.json`;
}

export function getInventoryIdFromDraft(draft: Record<string, unknown>) {
  const ruta = stringValue(draft.ruta).trim();
  const provyta = stringValue(draft.provyta).trim();
  if (!ruta || !provyta) {
    return null;
  }

  return createPlotFileBase(draft);
}

export async function loadInventoryIndex() {
  return (await readJsonFile<InventoryListItem[]>(inventoryIndexPath)) ?? [];
}

export async function loadInventoryDraftSnapshot(item: InventoryListItem) {
  return readJsonFile<Record<string, unknown>>(getDraftPath(item.id));
}

async function saveInventoryIndex(items: InventoryListItem[]) {
  await writeJsonFile(
    inventoryIndexPath,
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}

export async function saveInventoryDraftSnapshot(draft: Record<string, unknown>) {
  const id = getInventoryIdFromDraft(draft);
  if (!id) {
    return null;
  }

  const now = new Date().toISOString();
  const existing = await loadInventoryIndex();
  const existingItem = existing.find(item => item.id === id);
  const nextItem: InventoryListItem = {
    id,
    ruta: stringValue(draft.ruta),
    provyta: stringValue(draft.provyta),
    pyid: stringValue(draft.pyid) || undefined,
    status: existingItem?.status ?? 'pågående',
    updatedAt: now,
    exportedAt: existingItem?.exportedAt,
  };

  await writeJsonFile(getDraftPath(id), draft);
  await saveInventoryIndex([nextItem, ...existing.filter(item => item.id !== id)]);
  return nextItem;
}

export async function markInventorySubmitted(draft: Record<string, unknown>) {
  const id = getInventoryIdFromDraft(draft);
  if (!id) {
    return null;
  }

  const now = new Date().toISOString();
  const existing = await loadInventoryIndex();
  const existingItem = existing.find(item => item.id === id);
  const nextItem: InventoryListItem = {
    id,
    ruta: stringValue(draft.ruta),
    provyta: stringValue(draft.provyta),
    pyid: stringValue(draft.pyid) || existingItem?.pyid,
    status: 'inskickad',
    updatedAt: now,
    exportedAt: now,
  };

  await saveInventoryIndex([nextItem, ...existing.filter(item => item.id !== id)]);
  return nextItem;
}

export async function deleteInventoryFromDevice(item: InventoryListItem) {
  await deleteFileIfExists(getDraftPath(item.id));
  await deleteFileIfExists(`${publicPaths.exportDir}/${sanitizePathSegment(item.id)}.json`);
  if (await RNFS.exists(publicPaths.exportDir)) {
    const exportFiles = await RNFS.readDir(publicPaths.exportDir);
    await Promise.all(
      exportFiles
        .filter(file => file.isFile() && file.name.startsWith(`${sanitizePathSegment(item.id)}_`) && file.name.endsWith('.json'))
        .map(file => deleteFileIfExists(file.path)),
    );
  }

  const photoDir = `${publicPaths.photosDir}/${sanitizePathSegment(item.id)}`;
  if (await RNFS.exists(photoDir)) {
    await RNFS.unlink(photoDir);
  }

  const existing = await loadInventoryIndex();
  await saveInventoryIndex(existing.filter(existingItem => existingItem.id !== item.id));
}
