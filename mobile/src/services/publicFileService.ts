import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import {Platform} from 'react-native';
import {BasicDataConfig, BootstrapMetadata} from '../types/basicData';

const ROOT_FOLDER_NAME = 'Strand';
const METADATA_KEY = '@strand/bootstrap-metadata';

function getRootDirectory() {
  if (Platform.OS === 'android' && RNFS.DownloadDirectoryPath) {
    return `${RNFS.DownloadDirectoryPath}/${ROOT_FOLDER_NAME}`;
  }

  return `${RNFS.DocumentDirectoryPath}/${ROOT_FOLDER_NAME}`;
}

export const publicPaths = {
  root: getRootDirectory(),
  basicDataDir: `${getRootDirectory()}/basic_data`,
  dataDir: `${getRootDirectory()}/data/provytor`,
  exportDir: `${getRootDirectory()}/export`,
  photosDir: `${getRootDirectory()}/photos`,
  documentsDir: `${getRootDirectory()}/documents`,
};

async function ensureDir(path: string) {
  const exists = await RNFS.exists(path);
  if (!exists) {
    await RNFS.mkdir(path);
  }
}

async function ensureParentDir(path: string) {
  const parts = path.split('/');
  parts.pop();
  const parent = parts.join('/');
  if (parent) {
    await ensureDir(parent);
  }
}

export async function ensurePublicDirectoryStructure() {
  await ensureDir(publicPaths.root);
  await ensureDir(publicPaths.basicDataDir);
  await ensureDir(publicPaths.dataDir);
  await ensureDir(publicPaths.exportDir);
  await ensureDir(publicPaths.photosDir);
  await ensureDir(publicPaths.documentsDir);
}

export function getBasicDataPath() {
  return `${publicPaths.basicDataDir}/basic_data.json`;
}

export function getWorkingDraftPath() {
  return `${publicPaths.dataDir}/working-copy.json`;
}

export async function fileExists(path: string) {
  return RNFS.exists(path);
}

export async function writeJsonFile(path: string, value: unknown) {
  await ensureParentDir(path);
  await RNFS.writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  const exists = await fileExists(path);
  if (!exists) {
    return null;
  }

  const content = await RNFS.readFile(path, 'utf8');
  return JSON.parse(content) as T;
}

export async function writeTextFile(path: string, value: string) {
  await ensureParentDir(path);
  await RNFS.writeFile(path, value, 'utf8');
}

export async function deleteFileIfExists(path: string) {
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
}

export function sanitizePathSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'okand'
  );
}

export async function saveCapturedPhotoToPublicStorage(
  sourceUri: string,
  options: {
    plotId: string;
    category: string;
    nameParts: string[];
  },
) {
  const sourcePath = sourceUri.replace(/^file:\/\//, '');
  const photoDir = `${publicPaths.photosDir}/${sanitizePathSegment(options.plotId)}/${sanitizePathSegment(
    options.category,
  )}`;
  await ensureDir(photoDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = options.nameParts.map(sanitizePathSegment).filter(Boolean).join('_');
  const fileName = `${baseName || timestamp}.jpg`;
  const destinationPath = `${photoDir}/${fileName}`;

  await deleteFileIfExists(destinationPath);
  await RNFS.moveFile(sourcePath, destinationPath);

  return {
    fileName,
    path: destinationPath,
    uri: `file://${destinationPath}`,
  };
}

export async function saveBootstrapMetadata(metadata: BootstrapMetadata) {
  await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
}

export async function loadBootstrapMetadata(): Promise<BootstrapMetadata | null> {
  const raw = await AsyncStorage.getItem(METADATA_KEY);
  return raw ? (JSON.parse(raw) as BootstrapMetadata) : null;
}

export async function saveWorkingDraft(draft: Record<string, unknown>) {
  await writeJsonFile(getWorkingDraftPath(), draft);
}

export async function loadWorkingDraft() {
  return readJsonFile<Record<string, unknown>>(getWorkingDraftPath());
}

export async function saveBasicDataToDisk(config: BasicDataConfig) {
  await writeJsonFile(getBasicDataPath(), config);
}

export async function loadBasicDataFromDisk() {
  return readJsonFile<BasicDataConfig>(getBasicDataPath());
}
