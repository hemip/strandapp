import {BasicDataConfig} from '../types/basicData';
import {createExportFileBase} from './namingService';
import {publicPaths, sanitizePathSegment, writeJsonFile} from './publicFileService';

interface ExportOptions {
  basicData: BasicDataConfig;
  draft: Record<string, unknown>;
}

export interface PhotoExportEntry {
  fieldPath: string;
  fileName: string;
  path: string;
  uri: string;
  category?: string;
  capturedAt?: string;
  typeValue?: string;
  typeLabel?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  accuracy?: number;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function isPhotoLike(value: unknown) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as {path?: unknown}).path === 'string' &&
      typeof (value as {fileName?: unknown}).fileName === 'string',
  );
}

function collectPhotos(value: unknown, fieldPath = ''): PhotoExportEntry[] {
  if (isPhotoLike(value)) {
    const photo = value as Record<string, unknown>;
    return [
      {
        fieldPath,
        fileName: stringValue(photo.fileName),
        path: stringValue(photo.path),
        uri: stringValue(photo.uri),
        category: stringValue(photo.category) || undefined,
        capturedAt: stringValue(photo.capturedAt) || undefined,
        typeValue: stringValue(photo.typeValue) || undefined,
        typeLabel: stringValue(photo.typeLabel) || undefined,
        latitude: typeof photo.latitude === 'number' ? photo.latitude : undefined,
        longitude: typeof photo.longitude === 'number' ? photo.longitude : undefined,
        altitude: typeof photo.altitude === 'number' ? photo.altitude : null,
        altitudeAccuracy: typeof photo.altitudeAccuracy === 'number' ? photo.altitudeAccuracy : null,
        accuracy: typeof photo.accuracy === 'number' ? photo.accuracy : undefined,
      },
    ];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPhotos(item, `${fieldPath}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nestedValue]) =>
      collectPhotos(nestedValue, fieldPath ? `${fieldPath}.${key}` : key),
    );
  }

  return [];
}

function createLegacyHeader(draft: Record<string, unknown>) {
  return {
    pyID: stringValue(draft.pyid),
    lagnummer: stringValue(draft.lagnummer),
    inventerare: stringValue(draft.inventerare),
    ruta: stringValue(draft.ruta),
    provyta: stringValue(draft.provyta),
    matstart: stringValue(draft.matstart) || new Date().toISOString().slice(0, 10),
    blalapp: stringValue(draft.bla_lapp),
  };
}

export function createDraftExportFileInfo(draft: Record<string, unknown>) {
  const exportId = createExportFileBase(draft);
  const fileName = `${sanitizePathSegment(exportId)}.json`;
  const path = `${publicPaths.exportDir}/${fileName}`;

  return {exportId, fileName, path};
}

export function createDraftExportPayload({basicData, draft}: ExportOptions, exportedAt = new Date().toISOString()) {
  const photos = collectPhotos(draft);

  return {
    schema: 'havsstrand-field-export',
    schema_version: 1,
    exported_at: exportedAt,
    app: {
      name: 'Strand',
      basic_data_id: basicData.meta.id,
      basic_data_version: basicData.meta.version,
      basic_data_generated_at: basicData.meta.generated_at,
    },
    legacy_header: createLegacyHeader(draft),
    inventeringstillfalle: {
      uuid: stringValue(draft.inventering_uuid),
      roll: stringValue(draft.inventering_roll),
      antal_inventerare: stringValue(draft.antal_inventerare),
    },
    data: draft,
    photos,
  };
}

export async function exportDraftToJson({basicData, draft}: ExportOptions) {
  const {fileName, path} = createDraftExportFileInfo(draft);
  const payload = createDraftExportPayload({basicData, draft});
  const photos = collectPhotos(draft);

  await writeJsonFile(path, payload);

  return {
    fileName,
    path,
    payload,
    photoCount: photos.length,
    photos,
  };
}
