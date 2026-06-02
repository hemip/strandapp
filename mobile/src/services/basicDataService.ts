import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import bundledBasicData from '../config/default-basic-data.json';
import {BasicDataConfig, BootstrapResource, UpdateCheckResult} from '../types/basicData';
import {
  fileExists,
  getBasicDataPath,
  publicPaths,
  saveBasicDataToDisk,
  writeTextFile,
  loadBasicDataFromDisk,
} from './publicFileService';

function isConfiguredRemoteUrl(url?: string) {
  return Boolean(url && !url.includes('example.org'));
}

export function getBundledBasicData(): BasicDataConfig {
  return bundledBasicData as BasicDataConfig;
}

export async function loadSavedBasicData() {
  return loadBasicDataFromDisk();
}

export async function saveBasicData(config: BasicDataConfig) {
  await saveBasicDataToDisk(config);
}

export async function hasSavedBasicData() {
  return fileExists(getBasicDataPath());
}

export async function isOnline() {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export async function fetchRemoteBasicData(config: BasicDataConfig) {
  const url = config.endpoints.basic_data_url;
  if (!isConfiguredRemoteUrl(url)) {
    return null;
  }

  const response = await fetch(url as string, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Kunde inte hämta basic_data (${response.status})`);
  }

  return (await response.json()) as BasicDataConfig;
}

export async function checkForRemoteBasicDataUpdate(
  localConfig: BasicDataConfig,
): Promise<UpdateCheckResult> {
  const remoteConfig = await fetchRemoteBasicData(localConfig);
  if (!remoteConfig) {
    return {updateAvailable: false};
  }

  const localVersion = localConfig.meta.version ?? '0.0.0';
  const remoteVersion = remoteConfig.meta.version ?? '0.0.0';

  return {
    updateAvailable: compareVersions(remoteVersion, localVersion) > 0,
    remoteVersion,
  };
}

export async function downloadBootstrapResources(config: BasicDataConfig) {
  if (!config.bootstrap_resources?.length) {
    return;
  }

  for (const resource of config.bootstrap_resources) {
    await downloadResourceIfConfigured(resource);
  }
}

async function downloadResourceIfConfigured(resource: BootstrapResource) {
  if (!resource.url) {
    await copyBundledResourceToPublicStorage(resource);
    return;
  }

  const response = await fetch(resource.url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Kunde inte hämta resurs ${resource.id}`);
  }

  const content = await response.text();
  const targetPath = `${publicPaths.root}/${resource.target_path.replace(/\//g, '/')}`;
  await writeTextFile(targetPath, content);
}

async function copyBundledResourceToPublicStorage(resource: BootstrapResource) {
  const assetFileName = resolveBundledAssetName(resource);
  if (!assetFileName) {
    return;
  }

  const assetPath = `bootstrap-data/${assetFileName}`;
  const targetPath = `${publicPaths.root}/${resource.target_path.replace(/\//g, '/')}`;

  try {
    const content = await RNFS.readFileAssets(assetPath, 'utf8');
    await writeTextFile(targetPath, content);
  } catch {
    // Om ingen buntad resurs finns låter vi detta passera tyst i grundversionen.
  }
}

function resolveBundledAssetName(resource: BootstrapResource) {
  const explicitName = typeof resource.asset_name === 'string' ? resource.asset_name : null;
  if (explicitName) {
    return explicitName;
  }

  const segments = resource.target_path.split('/');
  return segments[segments.length - 1] ?? null;
}

function compareVersions(a: string, b: string) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const max = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < max; index += 1) {
    const aValue = aParts[index] ?? 0;
    const bValue = bParts[index] ?? 0;

    if (aValue > bValue) {
      return 1;
    }

    if (aValue < bValue) {
      return -1;
    }
  }

  return 0;
}
