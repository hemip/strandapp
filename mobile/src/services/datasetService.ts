import RNFS from 'react-native-fs';
import {BasicDataConfig, BasicDataField} from '../types/basicData';
import {publicPaths} from './publicFileService';

export type DatasetRow = Record<string, string>;
export type DatasetMap = Record<string, DatasetRow[]>;

export interface ArtResourceRow {
  id: string;
  table: string;
  taxonId: string;
  family: string;
  scientificName: string;
  swedishName: string;
  registrationMode: 'count' | 'area' | 'presence' | 'bush';
  registrationCode: string;
  metadata?: string;
}

const DATASET_RESOURCE_DIRS = ['utlagg', 'vardelistor', 'artlistor'];

const DATASET_FILE_ALIASES: Record<string, string[]> = {
  provyteunderlag: ['data.csv', 'provyteunderlag.csv'],
  atlasartlista_havsstrand: ['atlasartlista_havsstrand.csv'],
  dynkoder: ['dynkoder.json'],
  habitatkoder: ['habitatkoder.json'],
};

export async function loadConfiguredDatasets(config: BasicDataConfig): Promise<DatasetMap> {
  const datasetIds = collectDatasetIds(config);
  const datasets: DatasetMap = {};

  await Promise.all(
    datasetIds.map(async datasetId => {
      const rows = await loadDataset(datasetId, config);
      if (rows.length > 0) {
        datasets[datasetId] = rows;
      }
    }),
  );

  return datasets;
}

export function filterDatasetRows(field: BasicDataField, rows: DatasetRow[], draft: Record<string, unknown>) {
  if (!field.filters?.length) {
    return rows;
  }

  return rows.filter(row =>
    field.filters?.every(filter => {
      const sourceValue = draft[filter.source_field];
      return sourceValue != null && sourceValue !== '' && row[filter.dataset_key] === String(sourceValue);
    }),
  );
}

export function findDatasetRow(field: BasicDataField, rows: DatasetRow[], draft: Record<string, unknown>) {
  const lookupKeys = field.lookup_by ?? [];
  if (lookupKeys.length === 0) {
    return null;
  }

  return rows.find(row =>
    lookupKeys.every(key => {
      const draftValue = draft[key];
      return draftValue != null && draftValue !== '' && row[key] === String(draftValue);
    }),
  ) ?? null;
}

export function getUniqueDatasetOptions(rows: DatasetRow[], valueKey: string, displayKey: string) {
  const seen = new Set<string>();

  return rows.reduce<Array<{value: string; label: string}>>((options, row) => {
    const value = row[valueKey];
    if (!value || seen.has(value)) {
      return options;
    }

    seen.add(value);
    options.push({
      value,
      label: row[displayKey] || value,
    });
    return options;
  }, []);
}

export async function loadConfiguredArtResources(config: BasicDataConfig) {
  const resources = new Map<string, string>();

  Object.values(config.lists).forEach(options => {
    options.forEach(option => {
      const value = option.value ?? option.id;
      if (value && option.resource) {
        resources.set(value, option.resource);
      }
    });
  });

  const entries = await Promise.all(
    Array.from(resources.entries()).map(async ([category, resourceName]) => {
      const rows = await loadArtResource(resourceName);
      return [category, rows] as const;
    }),
  );

  return Object.fromEntries(entries);
}

async function loadDataset(datasetId: string, config: BasicDataConfig) {
  const resource = await findFirstExistingFile(getDatasetFileCandidates(datasetId, config));
  if (!resource) {
    return [];
  }

  const content = await RNFS.readFile(resource, 'utf8');
  return resource.toLowerCase().endsWith('.json') ? parseJsonDataset(content) : parseCsv(content);
}

function getDatasetFileCandidates(datasetId: string, config: BasicDataConfig) {
  const configuredResource = config.bootstrap_resources?.find(resource => resource.id === datasetId);
  const aliases = DATASET_FILE_ALIASES[datasetId] ?? [`${datasetId}.csv`];
  return [
    ...aliases.map(fileName => `${publicPaths.basicDataDir}/${fileName}`),
    ...aliases.map(fileName => `${publicPaths.root}/${fileName}`),
    ...DATASET_RESOURCE_DIRS.flatMap(dir =>
      aliases.flatMap(fileName => [
        `${publicPaths.basicDataDir}/${dir}/${fileName}`,
        `${publicPaths.basicDataDir}/basic_data/${dir}/${fileName}`,
      ]),
    ),
    configuredResource ? `${publicPaths.root}/${configuredResource.target_path}` : null,
    configuredResource ? `${publicPaths.basicDataDir}/${configuredResource.target_path}` : null,
  ].filter((candidate): candidate is string => Boolean(candidate));
}

async function loadArtResource(resourceName: string): Promise<ArtResourceRow[]> {
  const candidates = [
    `${publicPaths.basicDataDir}/${resourceName}`,
    `${publicPaths.root}/${resourceName}`,
    `${publicPaths.basicDataDir}/basic_data/${resourceName}`,
    ...DATASET_RESOURCE_DIRS.map(dir => `${publicPaths.basicDataDir}/${dir}/${resourceName}`),
    ...DATASET_RESOURCE_DIRS.map(dir => `${publicPaths.basicDataDir}/basic_data/${dir}/${resourceName}`),
  ];

  const resource = await findFirstExistingFile(candidates);
  if (resource) {
    const content = await RNFS.readFile(resource, 'utf8');
    return parseArtCsv(content);
  }

  return [];
}

async function findFirstExistingFile(candidates: string[]) {
  for (const candidate of candidates) {
    if (await RNFS.exists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function collectDatasetIds(config: BasicDataConfig) {
  const datasetIds = new Set<string>();

  config.bootstrap_resources
    ?.filter(resource => resource.type === 'csv' || resource.type === 'json')
    .forEach(resource => datasetIds.add(resource.id));

  const visitField = (fieldOrId: string | BasicDataField) => {
    if (typeof fieldOrId === 'string') {
      const field = config.global_fields?.find(globalField => globalField.id === fieldOrId);
      if (field?.dataset) {
        datasetIds.add(field.dataset);
      }
      return;
    }

    if (fieldOrId.dataset) {
      datasetIds.add(fieldOrId.dataset);
    }

    const itemSchema = fieldOrId.item_schema;
    if (itemSchema && typeof itemSchema === 'object' && 'fields' in itemSchema && Array.isArray(itemSchema.fields)) {
      itemSchema.fields.forEach(nestedField => {
        if (nestedField && typeof nestedField === 'object') {
          visitField(nestedField as BasicDataField);
        }
      });
    }
  };

  config.global_fields?.forEach(visitField);
  config.tabs.forEach(tab => tab.sections.forEach(section => section.fields.forEach(visitField)));

  return Array.from(datasetIds);
}

function parseJsonDataset(content: string): DatasetRow[] {
  const parsed = JSON.parse(content.replace(/^\uFEFF/, '')) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as {items?: unknown}).items)
      ? (parsed as {items: unknown[]}).items
      : [];

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
    .map(row =>
      Object.entries(row).reduce<DatasetRow>((nextRow, [key, value]) => {
        if (value != null && typeof value !== 'object') {
          nextRow[key] = String(value);
        }
        return nextRow;
      }, {}),
    );
}

function parseCsv(content: string): DatasetRow[] {
  const records = parseCsvRecords(content);
  const headers = records.shift()?.map(header => header.trim()) ?? [];

  return records
    .filter(record => record.some(value => value.trim() !== ''))
    .map(record =>
      headers.reduce<DatasetRow>((row, header, index) => {
        row[header] = record[index]?.trim() ?? '';
        return row;
      }, {}),
    );
}

function parseCsvRecords(content: string) {
  const records: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(value);
      records.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    records.push(row);
  }

  return records;
}

function getRegistrationMode(registrationCode: string): ArtResourceRow['registrationMode'] {
  const normalizedCode = registrationCode.toLowerCase();
  if (normalizedCode.includes('b')) {
    return 'bush';
  }
  if (normalizedCode.includes('r')) {
    return 'count';
  }
  if (normalizedCode.includes('t')) {
    return 'area';
  }
  return 'presence';
}

function parseArtCsv(content: string): ArtResourceRow[] {
  const records = parseCsvRecords(content.replace(/^\uFEFF/, ''));
  const headers = records[0]?.map(header => header.trim()) ?? [];

  if (headers.includes('scientific_name') || headers.includes('taxon_id')) {
    const rows = parseCsv(content);
    return rows.map((row, index) => {
      const taxonId = row.taxon_id?.trim() ?? '';
      const scientificName = row.scientific_name?.trim() ?? '';
      const swedishName = row.vernacular_name?.trim() ?? scientificName;
      const registrationCode = row.registrering?.trim() ?? '';

      return {
        id: taxonId || `${scientificName || swedishName || index}-${index}`,
        table: row.tabell?.trim() ?? '',
        taxonId,
        family: row.family?.trim() ?? '',
        scientificName,
        swedishName,
        registrationMode: getRegistrationMode(registrationCode),
        registrationCode,
        metadata: [row.phylum?.trim()].filter(Boolean).join(', ') || undefined,
      };
    });
  }

  return records
    .filter(record => record.some(value => value.trim() !== ''))
    .map((record, index) => {
      const family = record[0]?.trim() ?? '';
      const scientificName = record[1]?.trim() ?? '';
      const swedishName = record[2]?.trim() ?? scientificName;
      const registrationCode = record[record.length - 1]?.trim() ?? '';
      const metadata = record.slice(3, -1).map(value => value.trim()).filter(Boolean).join(', ');

      return {
        id: `${scientificName || swedishName || index}-${index}`,
        table: '',
        taxonId: '',
        family,
        scientificName,
        swedishName,
        registrationMode: getRegistrationMode(registrationCode),
        registrationCode,
        metadata,
      };
    });
}
