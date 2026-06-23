import {NativeModules, Platform} from 'react-native';
import {PhotoExportEntry} from './exportService';
import {publicPaths} from './publicFileService';

interface SftpDownloadResult {
  downloaded: number;
  skipped: number;
  directories: number;
}

interface SftpUploadResult {
  uploaded: number;
  skipped: number;
  missing: number;
}

interface SftpUploadFile {
  localPath: string;
  remoteName: string;
}

export interface ServerMessageFile {
  fileName: string;
  modifiedAt: number;
  size: number;
  text: string;
}

interface SftpBundleNativeModule {
  downloadNewerFiles(options: {
    host: string;
    port: number;
    username: string;
    password: string;
    remoteDir: string;
    localDir: string;
  }): Promise<SftpDownloadResult>;
  uploadNewerFiles(options: {
    host: string;
    port: number;
    username: string;
    password: string;
    remoteDir: string;
    files: SftpUploadFile[];
  }): Promise<SftpUploadResult>;
  listTextFiles(options: {
    host: string;
    port: number;
    username: string;
    password: string;
    remoteDir: string;
  }): Promise<ServerMessageFile[]>;
}

const sftpBundle = NativeModules.SftpBundle as SftpBundleNativeModule | undefined;

const SFTP_CONFIG = {
  host: 'akka.srh.slu.se',
  port: 22,
  username: 'nils99',
  password: '341bnVax',
};

const SFTP_REMOTE_DIRS = {
  bundle: 'bundle',
  export: 'strandexport',
  messages: 'messages',
  photos: 'strandpics',
};

function getSftpModule() {
  if (Platform.OS !== 'android') {
    throw new Error('SFTP är bara implementerad för Android.');
  }

  if (!sftpBundle) {
    throw new Error('SFTP-modulen är inte tillgänglig i appen.');
  }

  return sftpBundle;
}

export async function downloadBasicDataBundleFromSftp() {
  return getSftpModule().downloadNewerFiles({
    ...SFTP_CONFIG,
    remoteDir: SFTP_REMOTE_DIRS.bundle,
    localDir: publicPaths.basicDataDir,
  });
}

export async function listServerMessagesFromSftp() {
  return getSftpModule().listTextFiles({
    ...SFTP_CONFIG,
    remoteDir: SFTP_REMOTE_DIRS.messages,
  });
}

export async function uploadExportAndPhotosToSftp(options: {
  exportPath: string;
  exportFileName: string;
  photos: PhotoExportEntry[];
}) {
  const sftp = getSftpModule();
  const exportResult = await sftp.uploadNewerFiles({
    ...SFTP_CONFIG,
    remoteDir: SFTP_REMOTE_DIRS.export,
    files: [{localPath: options.exportPath, remoteName: options.exportFileName}],
  });

  const photoFiles = options.photos
    .filter(photo => photo.path && photo.fileName)
    .map(photo => ({
      localPath: photo.path,
      remoteName: photo.fileName,
    }));

  const photoResult =
    photoFiles.length > 0
      ? await sftp.uploadNewerFiles({
          ...SFTP_CONFIG,
          remoteDir: SFTP_REMOTE_DIRS.photos,
          files: photoFiles,
        })
      : {uploaded: 0, skipped: 0, missing: 0};

  return {
    export: exportResult,
    photos: photoResult,
  };
}
