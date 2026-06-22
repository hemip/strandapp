import {
  checkForRemoteBasicDataUpdate,
  downloadBootstrapResources,
  fetchRemoteBasicData,
  getBundledBasicData,
  isOnline,
  loadSavedBasicData,
  saveBasicData,
} from './basicDataService';
import {
  ensurePublicDirectoryStructure,
  loadBootstrapMetadata,
  normalizeBasicDataDirectory,
  resetBasicDataDirectory,
  saveBootstrapMetadata,
} from './publicFileService';
import {BasicDataConfig, UpdateCheckResult} from '../types/basicData';
import {downloadBasicDataBundleFromSftp} from './sftpBundleService';

export interface AppBootstrapResult {
  basicData: BasicDataConfig;
  bootstrapMode: 'fresh' | 'cached';
  notices: string[];
  updateCheck: UpdateCheckResult;
  source: 'bundled' | 'remote';
}

export async function initializeApplication(): Promise<AppBootstrapResult> {
  await ensurePublicDirectoryStructure();

  const bundled = getBundledBasicData();
  let saved = await loadSavedBasicData();

  if (saved && compareVersions(bundled.meta.version, saved.meta.version) > 0) {
    await saveBasicData(bundled);
    await downloadBootstrapResources(bundled);
    await normalizeBasicDataDirectory();
    await saveBootstrapMetadata({
      basicDataVersion: bundled.meta.version,
      bootstrappedAt: new Date().toISOString(),
      lastUpdateCheckAt: new Date().toISOString(),
      source: 'bundled',
    });
    saved = bundled;
  }

  if (!saved) {
    return bootstrapFirstLaunch(bundled);
  }

  try {
    await normalizeBasicDataDirectory();
  } catch {
    // Om en äldre installation saknar någon resurs fortsätter appen med det som finns.
  }

  const notices = ['Lokal konfiguration laddad.'];
  const online = await isOnline();
  let updateCheck: UpdateCheckResult = {updateAvailable: false};

  if (online) {
    try {
      updateCheck = await checkForRemoteBasicDataUpdate(saved);
      await updateBootstrapCheckTimestamp(saved.meta.version);
      if (updateCheck.updateAvailable) {
        notices.push(`Ny basic_data finns tillgänglig (${updateCheck.remoteVersion}).`);
      }
    } catch {
      notices.push('Kunde inte kontrollera om ny basic_data finns.');
    }
  } else {
    notices.push('Ingen internetanslutning. Appen fortsätter helt offline.');
  }

  return {
    basicData: saved,
    bootstrapMode: 'cached',
    notices,
    updateCheck,
    source: 'bundled',
  };
}

export async function runManualBasicDataUpdate(currentConfig?: BasicDataConfig) {
  const base = currentConfig ?? (await loadSavedBasicData()) ?? getBundledBasicData();
  let sftpError: unknown = null;

  try {
    await resetBasicDataDirectory();
    await downloadBasicDataBundleFromSftp();
    await normalizeBasicDataDirectory();
    const sftpConfig = (await loadSavedBasicData()) ?? base;

    await saveBootstrapMetadata({
      basicDataVersion: sftpConfig.meta.version,
      bootstrappedAt: new Date().toISOString(),
      lastUpdateCheckAt: new Date().toISOString(),
      source: 'remote',
    });

    return sftpConfig;
  } catch (error) {
    sftpError = error;
  }

  const remote = await fetchRemoteBasicData(base);

  if (!remote) {
    if (sftpError) {
      await saveBasicData(base);
      await downloadBootstrapResources(base);
      const message = sftpError instanceof Error ? sftpError.message : 'SFTP-hämtningen misslyckades.';
      throw new Error(message);
    }

    await saveBasicData(base);
    await downloadBootstrapResources(base);
    await saveBootstrapMetadata({
      basicDataVersion: base.meta.version,
      bootstrappedAt: new Date().toISOString(),
      lastUpdateCheckAt: new Date().toISOString(),
      source: 'bundled',
    });
    return base;
  }

  await saveBasicData(remote);
  await downloadBootstrapResources(remote);
  await saveBootstrapMetadata({
    basicDataVersion: remote.meta.version,
    bootstrappedAt: new Date().toISOString(),
    lastUpdateCheckAt: new Date().toISOString(),
    source: 'remote',
  });

  return remote;
}

async function bootstrapFirstLaunch(bundled: BasicDataConfig): Promise<AppBootstrapResult> {
  const notices: string[] = [];
  const online = await isOnline();

  if (online) {
    try {
      const remote = await fetchRemoteBasicData(bundled);
      if (remote) {
        await saveBasicData(remote);
        await downloadBootstrapResources(remote);
        await normalizeBasicDataDirectory();
        await saveBootstrapMetadata({
          basicDataVersion: remote.meta.version,
          bootstrappedAt: new Date().toISOString(),
          lastUpdateCheckAt: new Date().toISOString(),
          source: 'remote',
        });

        notices.push('Första uppstart klar. Grunddata hämtades från internet.');

        return {
          basicData: remote,
          bootstrapMode: 'fresh',
          notices,
          updateCheck: {updateAvailable: false},
          source: 'remote',
        };
      }
    } catch {
      notices.push('Första hämtningen från internet misslyckades. Buntad konfiguration används i stället.');
    }
  } else {
    notices.push('Ingen internetanslutning vid första start. Buntad konfiguration används tillfälligt.');
  }

  await saveBasicData(bundled);
  await downloadBootstrapResources(bundled);
  await normalizeBasicDataDirectory();
  await saveBootstrapMetadata({
    basicDataVersion: bundled.meta.version,
    bootstrappedAt: new Date().toISOString(),
    source: 'bundled',
  });

  notices.push('Buntade datafiler kopierades till publik lagring.');

  return {
    basicData: bundled,
    bootstrapMode: 'fresh',
    notices,
    updateCheck: {updateAvailable: false},
    source: 'bundled',
  };
}

async function updateBootstrapCheckTimestamp(version: string) {
  const existing = await loadBootstrapMetadata();
  await saveBootstrapMetadata({
    basicDataVersion: version,
    bootstrappedAt: existing?.bootstrappedAt ?? new Date().toISOString(),
    lastUpdateCheckAt: new Date().toISOString(),
    source: existing?.source ?? 'bundled',
  });
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
