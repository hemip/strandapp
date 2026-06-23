import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import {Platform} from 'react-native';
import {BasicDataConfig, BootstrapMetadata} from '../types/basicData';

const ROOT_FOLDER_NAME = 'Strand';
const METADATA_KEY = '@strand/bootstrap-metadata';

function getRootDirectory() {
  if (Platform.OS === 'android' && RNFS.ExternalDirectoryPath) {
    return `${RNFS.ExternalDirectoryPath}/${ROOT_FOLDER_NAME}`;
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

export async function resetBasicDataDirectory() {
  await ensureDir(publicPaths.root);
  if (await RNFS.exists(publicPaths.basicDataDir)) {
    await RNFS.unlink(publicPaths.basicDataDir);
  }
  await ensureDir(publicPaths.basicDataDir);
}

export function getBasicDataPath() {
  return `${publicPaths.basicDataDir}/basic_data.json`;
}

function getBasicDataCandidatePaths() {
  return [
    getBasicDataPath(),
    `${publicPaths.basicDataDir}/basic_data.bas.json`,
    `${publicPaths.basicDataDir}/default-basic-data.json`,
    `${publicPaths.basicDataDir}/basic_data/basic_data.json`,
    `${publicPaths.basicDataDir}/basic_data/basic_data.bas.json`,
    `${publicPaths.basicDataDir}/basic_data/default-basic-data.json`,
  ];
}

function getCanonicalBasicDataFileCandidates() {
  return {
    basicData: getBasicDataCandidatePaths(),
    data: [
      `${publicPaths.basicDataDir}/data.csv`,
      `${publicPaths.basicDataDir}/utlagg/data.csv`,
      `${publicPaths.basicDataDir}/basic_data/data.csv`,
      `${publicPaths.basicDataDir}/basic_data/utlagg/data.csv`,
    ],
    artList: [
      `${publicPaths.basicDataDir}/havsstrand_artlista.csv`,
      `${publicPaths.basicDataDir}/artlistor/havsstrand_artlista.csv`,
      `${publicPaths.basicDataDir}/basic_data/havsstrand_artlista.csv`,
      `${publicPaths.basicDataDir}/basic_data/artlistor/havsstrand_artlista.csv`,
      `${publicPaths.basicDataDir}/strandinventering_arter_alla.csv`,
      `${publicPaths.basicDataDir}/artlistor/strandinventering_arter_alla.csv`,
    ],
    atlasArtList: [
      `${publicPaths.basicDataDir}/atlasartlista_havsstrand.csv`,
      `${publicPaths.basicDataDir}/artlistor/atlasartlista_havsstrand.csv`,
      `${publicPaths.basicDataDir}/basic_data/atlasartlista_havsstrand.csv`,
      `${publicPaths.basicDataDir}/basic_data/artlistor/atlasartlista_havsstrand.csv`,
    ],
    dynCodes: [
      `${publicPaths.basicDataDir}/dynkoder.json`,
      `${publicPaths.basicDataDir}/basic_data/dynkoder.json`,
      `${publicPaths.basicDataDir}/vardelistor/dynkoder.json`,
      `${publicPaths.basicDataDir}/basic_data/vardelistor/dynkoder.json`,
    ],
    habitatCodes: [
      `${publicPaths.basicDataDir}/habitatkoder.json`,
      `${publicPaths.basicDataDir}/basic_data/habitatkoder.json`,
      `${publicPaths.basicDataDir}/vardelistor/habitatkoder.json`,
      `${publicPaths.basicDataDir}/basic_data/vardelistor/habitatkoder.json`,
    ],
  };
}

async function readFirstExistingTextFile(paths: string[]) {
  for (const path of paths) {
    if (await RNFS.exists(path)) {
      return RNFS.readFile(path, 'utf8');
    }
  }

  return null;
}

export async function normalizeBasicDataDirectory() {
  const candidates = getCanonicalBasicDataFileCandidates();
  const basicDataContent = await readFirstExistingTextFile(candidates.basicData);
  const dataContent = await readFirstExistingTextFile(candidates.data);
  const artListContent = await readFirstExistingTextFile(candidates.artList);
  const atlasArtListContent = await readFirstExistingTextFile(candidates.atlasArtList);
  const dynCodesContent = await readFirstExistingTextFile(candidates.dynCodes);
  const habitatCodesContent = await readFirstExistingTextFile(candidates.habitatCodes);

  if (!basicDataContent) {
    throw new Error('Ingen basic_data-fil hittades i hämtad bundle.');
  }

  if (!dataContent) {
    throw new Error('Ingen data.csv hittades i hämtad bundle.');
  }

  if (!artListContent) {
    throw new Error('Ingen havsstrand_artlista.csv hittades i hämtad bundle.');
  }

  if (!atlasArtListContent) {
    throw new Error('Ingen atlasartlista_havsstrand.csv hittades i hämtad bundle.');
  }

  await resetBasicDataDirectory();
  await RNFS.writeFile(getBasicDataPath(), basicDataContent.replace(/^\uFEFF/, ''), 'utf8');
  await RNFS.writeFile(`${publicPaths.basicDataDir}/data.csv`, dataContent, 'utf8');
  await RNFS.writeFile(`${publicPaths.basicDataDir}/havsstrand_artlista.csv`, artListContent, 'utf8');
  await RNFS.writeFile(`${publicPaths.basicDataDir}/atlasartlista_havsstrand.csv`, atlasArtListContent, 'utf8');
  if (dynCodesContent) {
    await RNFS.writeFile(`${publicPaths.basicDataDir}/dynkoder.json`, dynCodesContent.replace(/^\uFEFF/, ''), 'utf8');
  }
  if (habitatCodesContent) {
    await RNFS.writeFile(`${publicPaths.basicDataDir}/habitatkoder.json`, habitatCodesContent.replace(/^\uFEFF/, ''), 'utf8');
  }
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
  return JSON.parse(content.replace(/^\uFEFF/, '')) as T;
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
  const candidates = await Promise.all(
    getBasicDataCandidatePaths().map(async path => {
      if (!(await RNFS.exists(path))) {
        return null;
      }

      try {
        const stat = await RNFS.stat(path);
        const modifiedAt = stat.mtime ? new Date(stat.mtime).getTime() : 0;
        return {path, modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : 0};
      } catch {
        return {path, modifiedAt: 0};
      }
    }),
  );
  const newest = candidates
    .filter((candidate): candidate is {path: string; modifiedAt: number} => Boolean(candidate))
    .sort((a, b) => b.modifiedAt - a.modifiedAt)[0];

  return newest ? readJsonFile<BasicDataConfig>(newest.path) : null;
}
