import 'react-native-get-random-values';

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Camera, CameraType, type CameraApi} from 'react-native-camera-kit';
import MapView, {Marker, Polyline, UrlTile} from 'react-native-maps';
import QRCode from 'react-native-qrcode-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {v4 as uuidv4} from 'uuid';
import {AppHeader} from './components/AppHeader';
import {useGpsStatus} from './hooks/useGpsStatus';
import {initializeApplication, runManualBasicDataUpdate} from './services/bootstrapService';
import {
  ArtResourceRow,
  DatasetMap,
  filterDatasetRows,
  findDatasetRow,
  getUniqueDatasetOptions,
  loadConfiguredArtResources,
  loadConfiguredDatasets,
} from './services/datasetService';
import {
  deleteFileIfExists,
  loadWorkingDraft,
  saveCapturedPhotoToPublicStorage,
  saveWorkingDraft,
} from './services/publicFileService';
import {exportDraftToJson} from './services/exportService';
import {
  InventoryListItem,
  deleteInventoryFromDevice,
  getInventoryIdFromDraft,
  loadInventoryIndex,
  markInventorySubmitted,
  saveInventoryDraftSnapshot,
} from './services/inventoryStore';
import {createPlotFileBase} from './services/namingService';
import {BasicDataConfig, BasicDataField, BasicDataListOption} from './types/basicData';

const SESSION_CODE_TYPE = 'strand-session';
const USER_SETUP_FIELD_IDS = new Set(['lagnummer', 'inventerare']);
const REQUIRES_SELECTED_PLOT_FIELD_IDS = new Set(['inventeringstyp']);
const HEADER_MENU_TAB_IDS = new Set([
  'substrat',
  'arter',
  'ej_inventerad',
  'extra_bilder',
]);
const NORMAL_INVENTORY_TAB_ID = 'start_bilder';
const DISTANCE_INVENTORY_TAB_ID = 'hydro';

interface PhotoEntry {
  id: string;
  fileName: string;
  path: string;
  uri: string;
  category: string;
  capturedAt: string;
  typeValue?: string;
  typeLabel?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  kommentar?: string;
  tag?: string;
}

interface PhotoCaptureTarget {
  fieldId: string;
  mode: 'single' | 'set' | 'repeater' | 'rowPhotoArray';
  category: string;
  label: string;
  typeValue?: string;
  typeLabel?: string;
  rowId?: string;
  nestedFieldId?: string;
}

type RepeaterRow = Record<string, unknown> & {id: string};
type ArtLists = Record<string, ArtResourceRow[]>;
type ArtTableRow = Record<string, string> & {id: string; artId: string};
type EditingFieldState = {
  field: BasicDataField;
  value: string;
};

interface MapPoint {
  x: number;
  y: number;
}

interface NearestPlotMatch {
  row: Record<string, string>;
  distanceMeters: number;
}

function isValidUuid(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function createSessionQrPayload(sessionUuid: string) {
  return JSON.stringify({
    type: SESSION_CODE_TYPE,
    uuid: sessionUuid,
  });
}

function parseSessionCode(rawValue: string): string | null {
  const trimmed = rawValue.trim();

  if (isValidUuid(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as {type?: string; uuid?: string};
    if (parsed.type === SESSION_CODE_TYPE && isValidUuid(parsed.uuid)) {
      return parsed.uuid;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveFieldFromMap(fieldOrId: string | BasicDataField, globalFieldMap: Map<string, BasicDataField>) {
  if (typeof fieldOrId !== 'string') {
    return fieldOrId;
  }

  return globalFieldMap.get(fieldOrId) ?? null;
}

function getFieldValidationMessage(field: BasicDataField, rawValue: string) {
  if (field.type !== 'integer' && field.type !== 'decimal') {
    return null;
  }

  if (rawValue.trim() === '') {
    return null;
  }

  const normalizedValue = rawValue.replace(',', '.');
  const numericValue = Number(normalizedValue);

  if (!Number.isFinite(numericValue)) {
    return 'Värdet är felaktigt.';
  }

  if (field.unit === '%' && numericValue > 100) {
    return 'Värdet är felaktigt. Procent kan inte vara över 100.';
  }

  if (field.unit === 'grader' && numericValue > 360) {
    return 'Värdet är felaktigt. Grader kan inte vara över 360.';
  }

  return null;
}

function isPhotoEntry(value: unknown): value is PhotoEntry {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as PhotoEntry).id === 'string' &&
      typeof (value as PhotoEntry).path === 'string',
  );
}

function getPhotoArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isPhotoEntry) : [];
}

function getPhotoRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, PhotoEntry | undefined>)
    : {};
}

function getRepeaterRows(value: unknown): RepeaterRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((row): row is RepeaterRow => Boolean(row && typeof row === 'object'))
    .map(row => ({
      ...row,
      id: typeof row.id === 'string' ? row.id : uuidv4(),
    }));
}

function getArtTableRows(value: unknown): ArtTableRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((row): row is ArtTableRow => Boolean(row && typeof row === 'object'))
    .map(row => ({
      ...row,
      id: typeof row.id === 'string' ? row.id : uuidv4(),
      artId: typeof row.artId === 'string' ? row.artId : '',
    }));
}

function getItemSchemaFields(field: BasicDataField) {
  const schema = field.item_schema;
  if (!schema || typeof schema !== 'object' || !('fields' in schema) || !Array.isArray(schema.fields)) {
    return [];
  }

  return schema.fields.filter((item): item is BasicDataField => Boolean(item && typeof item === 'object'));
}

function getStringArrayProperty(field: BasicDataField, key: string) {
  const value = field[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatConfigLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

function parseNumber(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function latLonToRelativeMeters(originLat: number, originLon: number, lat: number, lon: number): MapPoint {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos((originLat * Math.PI) / 180);

  return {
    x: (lon - originLon) * metersPerDegreeLon,
    y: (lat - originLat) * metersPerDegreeLat,
  };
}

function getTransectEndPoint(lengthMeters: number, bearingDegrees: number): MapPoint {
  const radians = (bearingDegrees * Math.PI) / 180;
  return {
    x: Math.sin(radians) * lengthMeters,
    y: Math.cos(radians) * lengthMeters,
  };
}

function relativeMetersToLatLon(originLat: number, originLon: number, point: MapPoint) {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos((originLat * Math.PI) / 180);

  return {
    latitude: originLat + point.y / metersPerDegreeLat,
    longitude: originLon + point.x / metersPerDegreeLon,
  };
}

function getDistanceMeters(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const relative = latLonToRelativeMeters(fromLat, fromLon, toLat, toLon);
  return Math.hypot(relative.x, relative.y);
}

function getDistanceToSegmentMeters(point: MapPoint, start: MapPoint, end: MapPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
  return Math.hypot(point.x - projected.x, point.y - projected.y);
}

function StrandApp() {
  const insets = useSafeAreaInsets();
  const {gps, refreshGps} = useGpsStatus();
  const [basicData, setBasicData] = useState<BasicDataConfig | null>(null);
  const [datasets, setDatasets] = useState<DatasetMap>({});
  const [artLists, setArtLists] = useState<ArtLists>({});
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showGpsModal, setShowGpsModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showPlotMapModal, setShowPlotMapModal] = useState(false);
  const [showInventoryListModal, setShowInventoryListModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showNavigationMenu, setShowNavigationMenu] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [inventories, setInventories] = useState<InventoryListItem[]>([]);
  const [deleteInventoryTarget, setDeleteInventoryTarget] = useState<InventoryListItem | null>(null);
  const [deleteInventoryInput, setDeleteInventoryInput] = useState('');
  const [editingField, setEditingField] = useState<EditingFieldState | null>(null);
  const [photoCaptureTarget, setPhotoCaptureTarget] = useState<PhotoCaptureTarget | null>(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [openDatasetFieldId, setOpenDatasetFieldId] = useState<string | null>(null);
  const [artSearchByField, setArtSearchByField] = useState<Record<string, string>>({});
  const [manualUuidInput, setManualUuidInput] = useState('');
  const [lagnummerInput, setLagnummerInput] = useState('');
  const [inventerareInput, setInventerareInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Förbereder appen...');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const photoCameraRef = useRef<CameraApi | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptShown = useRef(false);

  const globalFieldMap = useMemo(() => {
    const map = new Map<string, BasicDataField>();
    basicData?.global_fields?.forEach(field => {
      map.set(field.id, field);
    });
    return map;
  }, [basicData]);

  const datasetValueFields = useMemo(() => {
    const fields: BasicDataField[] = [];
    const addField = (fieldOrId: string | BasicDataField) => {
      const field = resolveFieldFromMap(fieldOrId, globalFieldMap);
      if (field?.type === 'dataset_value') {
        fields.push(field);
      }
    };

    basicData?.global_fields?.forEach(addField);
    basicData?.tabs.forEach(tab => tab.sections.forEach(section => section.fields.forEach(addField)));

    return fields;
  }, [basicData, globalFieldMap]);

  const lagnummer = typeof draft.lagnummer === 'string' ? draft.lagnummer : '';
  const inventerare = typeof draft.inventerare === 'string' ? draft.inventerare : '';
  const ruta = typeof draft.ruta === 'string' ? draft.ruta : '';
  const provyta = typeof draft.provyta === 'string' ? draft.provyta : '';
  const hasUserSetup = lagnummer.trim().length > 0 && inventerare.trim().length > 0;
  const hasSelectedPlot = ruta.trim().length > 0 && provyta.trim().length > 0;

  const selectedPlotRow = useMemo(() => {
    const rows = datasets.provyteunderlag ?? [];
    if (!ruta || !provyta) {
      return null;
    }

    return rows.find(row => row.ruta === ruta && row.provyta === provyta) ?? null;
  }, [datasets.provyteunderlag, provyta, ruta]);

  const nearestPlotMatch = useMemo<NearestPlotMatch | null>(() => {
    const latitude = gps.latitude;
    const longitude = gps.longitude;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return null;
    }

    return (datasets.provyteunderlag ?? []).reduce<NearestPlotMatch | null>((best, row) => {
      const rowLat = parseNumber(row.latitud);
      const rowLon = parseNumber(row.longitud);
      if (rowLat == null || rowLon == null) {
        return best;
      }

      const distanceMeters = getDistanceMeters(latitude, longitude, rowLat, rowLon);
      if (!best || distanceMeters < best.distanceMeters) {
        return {row, distanceMeters};
      }

      return best;
    }, null);
  }, [datasets.provyteunderlag, gps.latitude, gps.longitude]);

  const transectDistanceMeters = useMemo(() => {
    if (!selectedPlotRow || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return null;
    }

    const startLat = parseNumber(selectedPlotRow.latitud);
    const startLon = parseNumber(selectedPlotRow.longitud);
    const lengthMeters = parseNumber(selectedPlotRow.transektlen);
    const bearingDegrees = parseNumber(selectedPlotRow.transektriktning);
    if (startLat == null || startLon == null || lengthMeters == null || bearingDegrees == null) {
      return null;
    }

    const userPoint = latLonToRelativeMeters(startLat, startLon, gps.latitude, gps.longitude);
    return getDistanceToSegmentMeters(userPoint, {x: 0, y: 0}, getTransectEndPoint(lengthMeters, bearingDegrees));
  }, [gps.latitude, gps.longitude, selectedPlotRow]);

  const handleManualUpdate = useCallback(async () => {
    try {
      setIsUpdating(true);
      const updated = await runManualBasicDataUpdate(basicData ?? undefined);
      const updatedDatasets = await loadConfiguredDatasets(updated);
      const updatedArtLists = await loadConfiguredArtResources(updated);
      setBasicData(updated);
      setDatasets(updatedDatasets);
      setArtLists(updatedArtLists);
      setUpdateVersion(null);
      Alert.alert('Klart', 'basic_data och tillhörande resurser uppdaterades.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Uppdateringen misslyckades.';
      Alert.alert('Kunde inte uppdatera', message);
    } finally {
      setIsUpdating(false);
    }
  }, [basicData]);

  useEffect(() => {
    const run = async () => {
      await boot();
    };

    run().catch(() => {
      // boot hanterar fel via UI och alert
    });
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!basicData || !activeTabId) {
      return;
    }

    const timeout = setTimeout(() => {
      saveWorkingDraft(draft)
        .then(() => saveInventoryDraftSnapshot(draft))
        .then(item => {
          if (item) {
            setInventories(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
          }
        })
        .catch(() => {
          // autosparning till publik fil fångas upp tyst här i grundversionen
        });
    }, 500);

    return () => clearTimeout(timeout);
  }, [activeTabId, basicData, draft]);

  useEffect(() => {
    if (!updateVersion || promptShown.current) {
      return;
    }

    promptShown.current = true;
    Alert.alert(
      'Uppdatering finns',
      `Det finns en ny version av basic_data (${updateVersion}). Vill du uppdatera nu?`,
      [
        {
          text: 'Senare',
          style: 'cancel',
        },
        {
          text: 'Uppdatera',
          onPress: () => {
            handleManualUpdate().catch(() => {
              // handleManualUpdate visar redan felmeddelande
            });
          },
        },
      ],
    );
  }, [handleManualUpdate, updateVersion]);

  useEffect(() => {
    const role = draft.inventering_roll;
    const sessionUuid = draft.inventering_uuid;

    if (role === 'master' && !isValidUuid(sessionUuid)) {
      setDraft(prev => ({
        ...prev,
        inventering_uuid: uuidv4(),
      }));
    }
  }, [draft.inventering_roll, draft.inventering_uuid]);

  useEffect(() => {
    if (datasetValueFields.length === 0) {
      return;
    }

    const nextValues: Record<string, string> = {};
    datasetValueFields.forEach(field => {
      const datasetRows = field.dataset ? datasets[field.dataset] ?? [] : [];
      const row = findDatasetRow(field, datasetRows, draft);
      const value = row && field.value_key ? row[field.value_key] : '';
      if (draft[field.id] !== value) {
        nextValues[field.id] = value;
      }
    });

    if (Object.keys(nextValues).length > 0) {
      setDraft(prev => ({...prev, ...nextValues}));
    }
  }, [datasetValueFields, datasets, draft]);

  async function boot() {
    try {
      setIsLoading(true);
      setStatusText('Förbereder appen och läser grunddata...');

      const result = await initializeApplication();
      const savedDraft = await loadWorkingDraft();
      const loadedDatasets = await loadConfiguredDatasets(result.basicData);
      const loadedArtLists = await loadConfiguredArtResources(result.basicData);
      const loadedInventories = await loadInventoryIndex();
      const firstTabId = result.basicData.tabs[0]?.id ?? '';

      setBasicData(result.basicData);
      setDatasets(loadedDatasets);
      setArtLists(loadedArtLists);
      setInventories(loadedInventories);
      setActiveTabId(firstTabId);
      setDraft(savedDraft ?? {});
      setLagnummerInput(typeof savedDraft?.lagnummer === 'string' ? savedDraft.lagnummer : '');
      setInventerareInput(typeof savedDraft?.inventerare === 'string' ? savedDraft.inventerare : '');
      setManualUuidInput(typeof savedDraft?.inventering_uuid === 'string' ? savedDraft.inventering_uuid : '');
      setUpdateVersion(result.updateCheck.updateAvailable ? result.updateCheck.remoteVersion ?? null : null);
      setStatusText('Klart');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okänt fel vid start.';
      setStatusText(message);
      Alert.alert('Startfel', message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && basicData && !hasUserSetup) {
      setShowUserModal(true);
    }
  }, [basicData, hasUserSetup, isLoading]);

  async function handleManualExport() {
    if (!basicData) {
      Alert.alert('Export saknar grunddata', 'Appen behöver ha läst in basic_data innan export kan skapas.');
      return;
    }

    if (!hasSelectedPlot) {
      Alert.alert('Välj provyta först', 'Välj ruta och provyta innan du skapar JSON-exporten.');
      return;
    }

    try {
      setIsExporting(true);
      await saveWorkingDraft(draft);
      const result = await exportDraftToJson({basicData, draft});
      const item = await markInventorySubmitted(draft);
      if (item) {
        setInventories(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
      }
      Alert.alert(
        'JSON-export skapad',
        `Fil: ${result.fileName}\nFoton i exporten: ${result.photoCount}\n\nSökväg:\n${result.path}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kunde inte skapa JSON-exporten.';
      Alert.alert('Exportfel', message);
    } finally {
      setIsExporting(false);
    }
  }

  function resolveField(fieldOrId: string | BasicDataField) {
    return resolveFieldFromMap(fieldOrId, globalFieldMap);
  }

  function handleExecuteInventoryChoice() {
    if (!hasSelectedPlot) {
      Alert.alert('Välj provyta först', 'Välj ruta och provyta innan du fortsätter.');
      return;
    }

    const inventoryType = draft.inventeringstyp;

    if (inventoryType === 'normal') {
      setActiveTabId(NORMAL_INVENTORY_TAB_ID);
      return;
    }

    if (inventoryType === 'distans') {
      setActiveTabId(DISTANCE_INVENTORY_TAB_ID);
      return;
    }

    if (inventoryType === 'ej_inventerad') {
      setActiveTabId('ej_inventerad');
      return;
    }

    if (inventoryType === 'markera_klar') {
      updateDraftValue('status', 'markerad_klar');
      Alert.alert('Markerad klar', 'Provytan är markerad som klar.');
      return;
    }

    Alert.alert('Välj åtgärd', 'Välj om provytan ska inventeras, avståndsinventeras, markeras klar eller inventeras ej.');
  }

  function updateDraftValue(fieldId: string, value: unknown) {
    setDraft(prev => {
      const next = {...prev, [fieldId]: value};

      basicData?.tabs.forEach(tab =>
        tab.sections.forEach(section =>
          section.fields.forEach(fieldOrId => {
            const field = resolveField(fieldOrId);
            const dependsOnChangedField =
              field?.filters?.some(filter => filter.source_field === fieldId) ||
              field?.lookup_by?.some(lookupField => lookupField === fieldId);

            if (field && field.id !== fieldId && dependsOnChangedField) {
              next[field.id] = '';
            }
          }),
        ),
      );

      return next;
    });

  }

  function selectPlotRow(row: Record<string, string>) {
    setDraft(prev => ({
      ...prev,
      ruta: row.ruta ?? '',
      provyta: row.provyta ?? '',
      pyid: row.pyid ?? '',
    }));
    setOpenDatasetFieldId(null);
  }

  function promptCreateInventoryFromMap(row: Record<string, string>) {
    Alert.alert(
      'Skapa inventering?',
      `Vill du skapa inventering på ruta ${row.ruta}, provyta ${row.provyta}?`,
      [
        {text: 'Avbryt', style: 'cancel'},
        {
          text: 'Skapa',
          onPress: () => {
            selectPlotRow(row);
            setShowPlotMapModal(false);
          },
        },
      ],
    );
  }

  function openDeleteInventory(item: InventoryListItem) {
    setDeleteInventoryTarget(item);
    setDeleteInventoryInput('');
  }

  async function confirmDeleteInventory() {
    if (!deleteInventoryTarget || deleteInventoryInput !== 'RADERA') {
      showValidationToast('Skriv RADERA för att bekräfta radering.');
      return;
    }

    try {
      await deleteInventoryFromDevice(deleteInventoryTarget);
      const activeInventoryId = getInventoryIdFromDraft(draft);
      if (activeInventoryId === deleteInventoryTarget.id) {
        const preservedUser = {
          lagnummer,
          inventerare,
        };
        setDraft(preservedUser);
        await saveWorkingDraft(preservedUser);
      }
      setInventories(await loadInventoryIndex());
      setDeleteInventoryTarget(null);
      setDeleteInventoryInput('');
      showValidationToast('Inventeringen raderades från telefonen.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kunde inte radera inventeringen.';
      Alert.alert('Raderingsfel', message);
    }
  }

  function showValidationToast(message: string) {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    setToastMessage(message);
    toastTimer.current = setTimeout(() => {
      setToastMessage(null);
      toastTimer.current = null;
    }, 3300);
  }

  function getFieldValueText(field: BasicDataField, value: unknown) {
    if (value === undefined || value === null || value === '') {
      return 'Ej ifyllt';
    }

    if (field.type === 'select' || field.type === 'boolean_select') {
      const options = field.list_id ? basicData?.lists[field.list_id] ?? [] : [];
      const option = options.find(item => (item.value ?? item.id ?? item.label) === value);
      return option?.label ?? String(value);
    }

    return field.unit ? `${String(value)} ${field.unit}` : String(value);
  }

  function getFieldPromptIcon(field: BasicDataField) {
    if (field.type === 'boolean_select') {
      return '?';
    }

    if (field.type === 'select') {
      return '▤';
    }

    return '✎';
  }

  function openFieldEditor(field: BasicDataField) {
    const value = draft[field.id];
    setEditingField({
      field,
      value: typeof value === 'string' || typeof value === 'number' ? String(value) : '',
    });
  }

  function saveFieldEditor() {
    if (!editingField) {
      return;
    }

    const {field, value} = editingField;
    const validationMessage = getFieldValidationMessage(field, value);

    if (validationMessage) {
      showValidationToast(validationMessage);
      return;
    }

    updateDraftValue(field.id, value);
    setEditingField(null);
  }

  function renderDialogField(field: BasicDataField, value: unknown) {
    return (
      <Pressable
        key={field.id}
        accessibilityLabel={`Ange ${field.label}`}
        accessibilityRole="button"
        onPress={() => openFieldEditor(field)}
        style={styles.promptFieldRow}>
        <Text style={styles.promptFieldIcon}>{getFieldPromptIcon(field)}</Text>
        <View style={styles.promptFieldTextBlock}>
          <Text style={styles.promptFieldLabel}>{field.label}</Text>
          <Text numberOfLines={1} style={styles.promptFieldValue}>
            {getFieldValueText(field, value)}
          </Text>
        </View>
      </Pressable>
    );
  }

  function openUserSettings() {
    setLagnummerInput(lagnummer);
    setInventerareInput(inventerare);
    setShowUserModal(true);
  }

  function saveUserSettings() {
    const nextLagnummer = lagnummerInput.trim();
    const nextInventerare = inventerareInput.trim();

    if (!nextLagnummer || !nextInventerare) {
      Alert.alert('Saknade uppgifter', 'Ange både lagnummer och inventerare innan du fortsätter.');
      return;
    }

    setDraft(prev => ({
      ...prev,
      lagnummer: nextLagnummer,
      inventerare: nextInventerare,
    }));
    setShowUserModal(false);
  }

  async function openScanner() {
    try {
      const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Kamerabehörighet',
        message: 'Strand behöver kameran för att skanna QR-koden från inventeringsledaren.',
        buttonPositive: 'Tillåt',
        buttonNegative: 'Avbryt',
      });

      if (status !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Kameran är inte tillgänglig', 'Ge kamerabehörighet för att kunna skanna QR-kod.');
        return;
      }

      setShowScannerModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kunde inte öppna kameran.';
      Alert.alert('Kamerafel', message);
    }
  }

  function applySessionUuid(rawValue: string, source: 'manual' | 'scan') {
    const sessionUuid = parseSessionCode(rawValue);

    if (!sessionUuid) {
      Alert.alert(
        'Ogiltig kod',
        source === 'scan'
          ? 'QR-koden innehöll inget giltigt inventeringstillfälle.'
          : 'Ange ett giltigt UUID eller skanna master-koden.',
      );
      return;
    }

    setDraft(prev => ({
      ...prev,
      inventering_uuid: sessionUuid,
      inventering_roll: prev.inventering_roll === 'master' ? prev.inventering_roll : 'hjalpare',
    }));
    setManualUuidInput(sessionUuid);
    setShowScannerModal(false);
  }

  function createFreshSessionUuid() {
    const nextUuid = uuidv4();
    setDraft(prev => ({
      ...prev,
      inventering_uuid: nextUuid,
      inventering_roll: 'master',
    }));
    setManualUuidInput(nextUuid);
  }

  function getPhotoFieldOptions(field: BasicDataField) {
    if (Array.isArray(field.list)) {
      return field.list as BasicDataListOption[];
    }

    return field.list_id ? basicData?.lists[field.list_id] ?? [] : [];
  }

  function getPhotoCategory(field: BasicDataField) {
    return typeof field.storage_category === 'string' ? field.storage_category : field.id;
  }

  function getPhotoPlotId() {
    return createPlotFileBase(draft);
  }

  async function openPhotoCapture(target: PhotoCaptureTarget) {
    try {
      const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Kamerabehörighet',
        message: 'Strand behöver kameran för att ta och spara bilder till vald provyta.',
        buttonPositive: 'Tillåt',
        buttonNegative: 'Avbryt',
      });

      if (status !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Kameran är inte tillgänglig', 'Ge kamerabehörighet för att kunna ta bilder.');
        return;
      }

      setPhotoCaptureTarget(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kunde inte öppna kameran.';
      Alert.alert('Kamerafel', message);
    }
  }

  async function capturePhoto() {
    if (!photoCaptureTarget || !photoCameraRef.current) {
      return;
    }

    try {
      setIsCapturingPhoto(true);
      const captured = await photoCameraRef.current.capture();
      const capturedAt = new Date().toISOString();
      const plotId = getPhotoPlotId();
      const photoName = photoCaptureTarget.typeValue ?? photoCaptureTarget.nestedFieldId ?? photoCaptureTarget.fieldId;
      const existingReplacementPhoto =
        photoCaptureTarget.mode === 'single'
          ? draft[photoCaptureTarget.fieldId]
          : photoCaptureTarget.mode === 'set' && photoCaptureTarget.typeValue
            ? getPhotoRecord(draft[photoCaptureTarget.fieldId])[photoCaptureTarget.typeValue]
            : null;
      if (isPhotoEntry(existingReplacementPhoto)) {
        await deleteFileIfExists(existingReplacementPhoto.path);
      }
      const saved = await saveCapturedPhotoToPublicStorage(captured.uri, {
        plotId,
        category: photoCaptureTarget.category,
        nameParts: [plotId, photoName],
      });
      const entry: PhotoEntry = {
        id: uuidv4(),
        fileName: saved.fileName,
        path: saved.path,
        uri: saved.uri,
        category: photoCaptureTarget.category,
        capturedAt,
        typeValue: photoCaptureTarget.typeValue,
        typeLabel: photoCaptureTarget.typeLabel,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracy: gps.accuracy,
      };

      if (
        photoCaptureTarget.mode === 'rowPhotoArray' &&
        photoCaptureTarget.rowId &&
        photoCaptureTarget.nestedFieldId
      ) {
        const configuredField = findConfiguredTopLevelField(photoCaptureTarget.fieldId);
        const rows =
          configuredField?.type === 'fixed_repeater'
            ? ensureFixedRepeaterRows(configuredField)
            : getRepeaterRows(draft[photoCaptureTarget.fieldId]);
        updateDraftValue(
          photoCaptureTarget.fieldId,
          rows.map(row => {
            if (row.id !== photoCaptureTarget.rowId || !photoCaptureTarget.nestedFieldId) {
              return row;
            }

            return {
              ...row,
              [photoCaptureTarget.nestedFieldId]: [...getPhotoArray(row[photoCaptureTarget.nestedFieldId]), entry],
            };
          }),
        );
      } else if (photoCaptureTarget.mode === 'single') {
        updateDraftValue(photoCaptureTarget.fieldId, entry);
      } else if (photoCaptureTarget.mode === 'set' && photoCaptureTarget.typeValue) {
        const current = getPhotoRecord(draft[photoCaptureTarget.fieldId]);
        updateDraftValue(photoCaptureTarget.fieldId, {
          ...current,
          [photoCaptureTarget.typeValue]: entry,
        });
      } else {
        const current = getPhotoArray(draft[photoCaptureTarget.fieldId]);
        updateDraftValue(photoCaptureTarget.fieldId, [...current, entry]);
      }

      setPhotoCaptureTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kunde inte spara bilden.';
      Alert.alert('Fotofel', message);
    } finally {
      setIsCapturingPhoto(false);
    }
  }

  function removePhoto(fieldId: string, photo: PhotoEntry, setKey?: string) {
    Alert.alert('Ta bort bild', 'Vill du ta bort bilden från provytan och telefonens bildmapp?', [
      {text: 'Avbryt', style: 'cancel'},
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          deleteFileIfExists(photo.path).catch(() => {
            // Fältet uppdateras även om filen redan saknas.
          });

          if (setKey) {
            const current = {...getPhotoRecord(draft[fieldId])};
            delete current[setKey];
            updateDraftValue(fieldId, current);
            return;
          }

          const current = getPhotoArray(draft[fieldId]);
          updateDraftValue(
            fieldId,
            current.filter(entry => entry.id !== photo.id),
          );
        },
      },
    ]);
  }

  function renderPhotoPreview(photo: PhotoEntry, onRemove: () => void, title?: string) {
    return (
      <View key={photo.id} style={styles.photoPreviewCard}>
        <Image source={{uri: photo.uri}} style={styles.photoPreviewImage} />
        <View style={styles.photoPreviewMeta}>
          <Text style={styles.photoPreviewTitle}>{title ?? photo.typeLabel ?? photo.fileName}</Text>
          <Text style={styles.photoPreviewText}>{new Date(photo.capturedAt).toLocaleString('sv-SE')}</Text>
          <Text numberOfLines={1} style={styles.photoPreviewText}>
            {photo.fileName}
          </Text>
        </View>
        <Pressable accessibilityLabel="Ta bort bild" onPress={onRemove} style={styles.smallDangerButton}>
          <Text style={styles.smallDangerButtonText}>Ta bort</Text>
        </Pressable>
      </View>
    );
  }

  function renderPhotoSingleField(field: BasicDataField) {
    const value = draft[field.id];
    const photo = isPhotoEntry(value) ? value : null;
    const category = getPhotoCategory(field);

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {photo ? renderPhotoPreview(photo, () => removePhoto(field.id, photo), field.label) : null}
        <Pressable
          onPress={() =>
            openPhotoCapture({
              fieldId: field.id,
              mode: 'single',
              category,
              label: field.label,
              typeValue: field.id,
              typeLabel: field.label,
            }).catch(() => undefined)
          }
          style={photo ? styles.secondaryButton : styles.primaryButton}>
          <Text style={photo ? styles.secondaryButtonText : styles.primaryButtonText}>
            {photo ? 'Ta om bild' : 'Ta bild'}
          </Text>
        </Pressable>
      </View>
    );
  }

  function renderPhotoSetField(field: BasicDataField) {
    const options = getPhotoFieldOptions(field);
    const photos = getPhotoRecord(draft[field.id]);
    const category = getPhotoCategory(field);

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <View style={styles.photoSetGrid}>
          {options.map(option => {
            const optionValue = option.value ?? option.id ?? option.label;
            const photo = photos[optionValue];
            const openCapture = () =>
              openPhotoCapture({
                fieldId: field.id,
                mode: 'set',
                category,
                label: option.label,
                typeValue: optionValue,
                typeLabel: option.label,
              }).catch(() => undefined);

            return (
              <View key={`${field.id}-${optionValue}`} style={styles.photoSetItem}>
                {photo ? (
                  <>
                    <Pressable
                      accessibilityLabel={`Ersätt bild ${option.label}`}
                      accessibilityRole="button"
                      onPress={openCapture}
                      style={styles.photoSetTakenSlot}>
                      <Image source={{uri: photo.uri}} style={styles.photoSetImage} />
                      <View style={styles.photoSetMeta}>
                        <Text style={styles.photoPreviewTitle}>{option.label}</Text>
                        <Text style={styles.photoPreviewText}>
                          {new Date(photo.capturedAt).toLocaleString('sv-SE')}
                        </Text>
                        <Text numberOfLines={1} style={styles.photoPreviewText}>
                          {photo.fileName}
                        </Text>
                        <Text style={styles.photoSetHint}>Tryck på rutan för att ersätta bilden.</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Ta bort bild ${option.label}`}
                      onPress={() => removePhoto(field.id, photo, optionValue)}
                      style={styles.smallDangerButton}>
                      <Text style={styles.smallDangerButtonText}>Ta bort</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    accessibilityLabel={`Ta bild ${option.label}`}
                    accessibilityRole="button"
                    onPress={openCapture}
                    style={styles.emptyPhotoSlot}>
                    <Text style={styles.emptyPhotoSlotText}>{option.label}</Text>
                    <Text style={styles.fieldHelp}>Tryck på rutan för att ta bild.</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  function updatePhotoRepeaterText(fieldId: string, photoId: string, key: 'kommentar' | 'tag', text: string) {
    const current = getPhotoArray(draft[fieldId]);
    updateDraftValue(
      fieldId,
      current.map(photo => (photo.id === photoId ? {...photo, [key]: text} : photo)),
    );
  }

  function renderPhotoRepeaterField(field: BasicDataField) {
    const photos = getPhotoArray(draft[field.id]);
    const category = getPhotoCategory(field);

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {photos.length === 0 ? <Text style={styles.fieldHelp}>Inga extra bilder tillagda ännu.</Text> : null}
        {photos.map(photo => (
          <View key={photo.id} style={styles.photoRepeaterItem}>
            {renderPhotoPreview(photo, () => removePhoto(field.id, photo))}
            <TextInput
              onChangeText={text => updatePhotoRepeaterText(field.id, photo.id, 'kommentar', text)}
              placeholder="Kommentar"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={photo.kommentar ?? ''}
            />
            <TextInput
              onChangeText={text => updatePhotoRepeaterText(field.id, photo.id, 'tag', text)}
              placeholder="Tag"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={photo.tag ?? ''}
            />
          </View>
        ))}
        <Pressable
          onPress={() =>
            openPhotoCapture({
              fieldId: field.id,
              mode: 'repeater',
              category,
              label: field.label,
            }).catch(() => undefined)
          }
          style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Lägg till bild</Text>
        </Pressable>
      </View>
    );
  }

  function findConfiguredTopLevelField(fieldId: string) {
    return basicData?.tabs
      .flatMap(tab => tab.sections)
      .flatMap(section => section.fields)
      .map(fieldOrId => resolveField(fieldOrId))
      .find(field => field?.id === fieldId);
  }

  function updateRepeaterRow(fieldId: string, rowId: string, key: string, value: unknown) {
    const configuredField = findConfiguredTopLevelField(fieldId);
    const rows =
      configuredField?.type === 'fixed_repeater'
        ? ensureFixedRepeaterRows(configuredField)
        : getRepeaterRows(draft[fieldId]);
    updateDraftValue(
      fieldId,
      rows.map(row => (row.id === rowId ? {...row, [key]: value} : row)),
    );
  }

  function addRepeaterRow(field: BasicDataField) {
    const rows = getRepeaterRows(draft[field.id]);
    updateDraftValue(field.id, [...rows, {id: uuidv4()}]);
  }

  function removeRepeaterRow(fieldId: string, rowId: string) {
    Alert.alert('Ta bort rad', 'Vill du ta bort raden?', [
      {text: 'Avbryt', style: 'cancel'},
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => updateDraftValue(fieldId, getRepeaterRows(draft[fieldId]).filter(row => row.id !== rowId)),
      },
    ]);
  }

  function ensureFixedRepeaterRows(field: BasicDataField) {
    const fixedItems = field.fixed_items_list_id ? basicData?.lists[String(field.fixed_items_list_id)] ?? [] : [];
    const rows = getRepeaterRows(draft[field.id]);
    const rowsByCategory = new Map(rows.map(row => [String(row.kategori ?? ''), row]));

    return fixedItems.map(item => {
      const categoryValue = item.label;
      const existing = rowsByCategory.get(categoryValue);
      return existing ?? {id: item.value ?? item.id ?? uuidv4(), kategori: categoryValue};
    });
  }

  function removeRowPhoto(fieldId: string, rowId: string, nestedFieldId: string, photo: PhotoEntry) {
    Alert.alert('Ta bort bild', 'Vill du ta bort bilden från raden och telefonens bildmapp?', [
      {text: 'Avbryt', style: 'cancel'},
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          deleteFileIfExists(photo.path).catch(() => {
            // Fältet uppdateras även om filen redan saknas.
          });
          const configuredField = findConfiguredTopLevelField(fieldId);
          const rows =
            configuredField?.type === 'fixed_repeater'
              ? ensureFixedRepeaterRows(configuredField)
              : getRepeaterRows(draft[fieldId]);
          updateDraftValue(
            fieldId,
            rows.map(row =>
              row.id === rowId
                ? {
                    ...row,
                    [nestedFieldId]: getPhotoArray(row[nestedFieldId]).filter(entry => entry.id !== photo.id),
                  }
                : row,
            ),
          );
        },
      },
    ]);
  }

  function renderRepeaterRowField(parentField: BasicDataField, row: RepeaterRow, field: BasicDataField) {
    const rowValue = row[field.id];

    if (field.type === 'photo_array') {
      const photos = getPhotoArray(rowValue);
      const category = getPhotoCategory(field);
      return (
        <View key={field.id} style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
          {photos.length === 0 ? <Text style={styles.fieldHelp}>Inga bilder tillagda.</Text> : null}
          {photos.map(photo =>
            renderPhotoPreview(photo, () => removeRowPhoto(parentField.id, row.id, field.id, photo), photo.typeLabel),
          )}
          <Pressable
            onPress={() =>
              openPhotoCapture({
                fieldId: parentField.id,
                mode: 'rowPhotoArray',
                category,
                label: field.label,
                rowId: row.id,
                nestedFieldId: field.id,
                typeValue: String(row.kategori ?? row.id),
                typeLabel: String(row.kategori ?? field.label),
              }).catch(() => undefined)
            }
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Lägg till bild</Text>
          </Pressable>
        </View>
      );
    }

    if (field.type === 'select' || field.type === 'boolean_select') {
      const options = field.list_id ? basicData?.lists[field.list_id] ?? [] : [];
      return (
        <View key={field.id} style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
          <View style={styles.optionWrap}>
            {options.map(option => {
              const optionValue = option.value ?? option.id ?? option.label;
              const selected = rowValue === optionValue;
              return (
                <Pressable
                  key={`${row.id}-${field.id}-${optionValue}`}
                  onPress={() => updateRepeaterRow(parentField.id, row.id, field.id, optionValue)}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}>
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }

    if (field.type === 'boolean') {
      return (
        <View key={field.id} style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
          <View style={styles.optionWrap}>
            {[
              {value: true, label: 'Ja'},
              {value: false, label: 'Nej'},
            ].map(option => {
              const selected = rowValue === option.value;
              return (
                <Pressable
                  key={`${row.id}-${field.id}-${String(option.value)}`}
                  onPress={() => updateRepeaterRow(parentField.id, row.id, field.id, option.value)}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}>
                  <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }

    return (
      <View key={field.id} style={styles.repeaterNestedBlock}>
        <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
        <TextInput
          editable={!field.readonly}
          keyboardType={field.type === 'integer' || field.type === 'decimal' ? 'numeric' : 'default'}
          onChangeText={text => updateRepeaterRow(parentField.id, row.id, field.id, text)}
          placeholder={field.unit ? `Ange värde (${field.unit})` : 'Ange värde'}
          placeholderTextColor="#8e8579"
          style={[styles.input, field.readonly && styles.inputDisabled]}
          value={String(rowValue ?? '')}
        />
      </View>
    );
  }

  function renderRepeaterField(field: BasicDataField, fixed = false) {
    const rows = fixed ? ensureFixedRepeaterRows(field) : getRepeaterRows(draft[field.id]);
    const itemFields = getItemSchemaFields(field);

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {rows.length === 0 ? <Text style={styles.fieldHelp}>Inga rader tillagda ännu.</Text> : null}
        {rows.map((row, index) => (
          <View key={row.id} style={styles.repeaterRowCard}>
            <View style={styles.repeaterRowHeader}>
              <Text style={styles.repeaterRowTitle}>{String(row.kategori ?? `Rad ${index + 1}`)}</Text>
              {!fixed ? (
                <Pressable onPress={() => removeRepeaterRow(field.id, row.id)} style={styles.smallDangerButton}>
                  <Text style={styles.smallDangerButtonText}>Ta bort</Text>
                </Pressable>
              ) : null}
            </View>
            {itemFields.map(itemField => renderRepeaterRowField(field, row, itemField))}
          </View>
        ))}
        {!fixed ? (
          <Pressable onPress={() => addRepeaterRow(field)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Lägg till rad</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function getMatrixValue(fieldId: string, rowId: string, columnId: string) {
    const matrix = draft[fieldId];
    if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
      return '';
    }

    const row = (matrix as Record<string, unknown>)[rowId];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return '';
    }

    const value = (row as Record<string, unknown>)[columnId];
    return typeof value === 'string' ? value : '';
  }

  function updateMatrixValue(fieldId: string, rowId: string, columnId: string, value: string) {
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, 3);
    const current = draft[fieldId] && typeof draft[fieldId] === 'object' && !Array.isArray(draft[fieldId])
      ? (draft[fieldId] as Record<string, Record<string, string>>)
      : {};
    const currentRow = current[rowId] ?? {};

    updateDraftValue(fieldId, {
      ...current,
      [rowId]: {
        ...currentRow,
        [columnId]: numericValue,
      },
    });
  }

  function getMatrixColumnTotal(fieldId: string, rows: string[], columnId: string) {
    return rows.reduce((total, rowId) => {
      const rawValue = getMatrixValue(fieldId, rowId, columnId);
      const numericValue = Number(rawValue);
      return Number.isFinite(numericValue) ? total + numericValue : total;
    }, 0);
  }

  function renderMatrixPercentField(field: BasicDataField) {
    const columns = getStringArrayProperty(field, 'columns');
    const rows = getStringArrayProperty(field, 'rows');
    const requiresHundred = field.sum_rule === 'per_column_must_equal_100';

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Text style={styles.fieldHelp}>Ange procent per substrat. Varje kolumn ska summera till 100.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.matrixTable}>
            <View style={styles.matrixRow}>
              <View style={[styles.matrixCell, styles.matrixLabelCell]} />
              {columns.map(column => (
                <View key={column} style={[styles.matrixCell, styles.matrixHeaderCell]}>
                  <Text style={styles.matrixHeaderText}>{formatConfigLabel(column)}</Text>
                </View>
              ))}
            </View>

            {rows.map(row => (
              <View key={row} style={styles.matrixRow}>
                <View style={[styles.matrixCell, styles.matrixLabelCell]}>
                  <Text style={styles.matrixRowLabel}>{formatConfigLabel(row)}</Text>
                </View>
                {columns.map(column => (
                  <View key={`${row}-${column}`} style={styles.matrixCell}>
                    <TextInput
                      keyboardType="numeric"
                      maxLength={3}
                      onChangeText={text => updateMatrixValue(field.id, row, column, text)}
                      placeholder="0"
                      placeholderTextColor="#8e8579"
                      style={styles.matrixInput}
                      value={getMatrixValue(field.id, row, column)}
                    />
                  </View>
                ))}
              </View>
            ))}

            <View style={[styles.matrixRow, styles.matrixTotalRow]}>
              <View style={[styles.matrixCell, styles.matrixLabelCell]}>
                <Text style={styles.matrixTotalLabel}>Summa</Text>
              </View>
              {columns.map(column => {
                const total = getMatrixColumnTotal(field.id, rows, column);
                const isValid = !requiresHundred || total === 100;
                return (
                  <View
                    key={`${column}-total`}
                    style={[styles.matrixCell, styles.matrixTotalCell, isValid ? styles.matrixTotalOk : styles.matrixTotalInvalid]}>
                    <Text style={[styles.matrixTotalText, isValid ? styles.matrixTotalTextOk : styles.matrixTotalTextInvalid]}>
                      {total}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  function renderResourcePickerField(field: BasicDataField) {
    const options = field.list_id ? basicData?.lists[field.list_id] ?? [] : [];
    const value = draft[field.id];

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <View style={styles.optionWrap}>
          {options.map(option => {
            const optionValue = option.value ?? option.id ?? option.label;
            const selected = value === optionValue;
            return (
              <Pressable
                key={`${field.id}-${optionValue}`}
                onPress={() => updateDraftValue(field.id, optionValue)}
                style={[styles.optionChip, selected && styles.optionChipSelected]}>
                <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  function getArtCategoryOption(field: BasicDataField) {
    const options = basicData?.lists.artkategorier ?? [];
    const configuredCategory = typeof field.category === 'string' ? field.category : null;
    const selectedCategory = typeof draft.arter_kategori_val === 'string' ? draft.arter_kategori_val : null;
    const category = configuredCategory ?? selectedCategory;

    return options.find(option => option.value === category) ?? null;
  }

  function getArtTableColumns(field: BasicDataField, option: BasicDataListOption | null) {
    const directColumns = getStringArrayProperty(field, 'columns');
    if (directColumns.length > 0) {
      return directColumns;
    }

    const modeId = option?.entry_mode;
    const modes = field.modes;
    if (!modeId || !modes || typeof modes !== 'object' || !(modeId in modes)) {
      return [];
    }

    const mode = (modes as Record<string, unknown>)[modeId];
    if (!mode || typeof mode !== 'object' || !('columns' in mode) || !Array.isArray(mode.columns)) {
      return [];
    }

    return mode.columns.filter((column): column is string => typeof column === 'string');
  }

  function getArtNameColumn(columns: string[]) {
    return columns.includes('namn') ? 'namn' : columns.includes('art') ? 'art' : columns[0] ?? 'art';
  }

  function addArtRow(field: BasicDataField, art: ArtResourceRow, columns: string[], category: string | null, entryMode?: string) {
    const nameColumn = getArtNameColumn(columns);
    const rows = getArtTableRows(draft[field.id]);
    const displayName = art.swedishName || art.scientificName;

    if (rows.some(row => row.artId === art.id && row.zone === (category ?? ''))) {
      showValidationToast('Arten finns redan i tabellen.');
      return;
    }

    updateDraftValue(field.id, [
      ...rows,
      {
        id: uuidv4(),
        artId: art.id,
        family: art.family,
        scientificName: art.scientificName,
        swedishName: art.swedishName,
        zone: category ?? '',
        registrationMode: art.registrationMode,
        registrationCode: art.registrationCode,
        latitude: typeof gps.latitude === 'number' ? String(gps.latitude) : '',
        longitude: typeof gps.longitude === 'number' ? String(gps.longitude) : '',
        accuracy: typeof gps.accuracy === 'number' ? String(gps.accuracy) : '',
        coordinateCapturedAt: new Date().toISOString(),
        ...(entryMode === 'species_observation'
          ? art.registrationMode === 'count'
            ? {antal: ''}
            : art.registrationMode === 'area'
              ? {m2: ''}
              : {finns: '1'}
          : {}),
        [nameColumn]: displayName,
      },
    ]);
    setArtSearchByField(prev => ({...prev, [field.id]: ''}));
  }

  function updateArtRow(fieldId: string, rowId: string, column: string, value: string) {
    updateDraftValue(
      fieldId,
      getArtTableRows(draft[fieldId]).map(row => (row.id === rowId ? {...row, [column]: value} : row)),
    );
  }

  function removeArtRow(fieldId: string, rowId: string) {
    updateDraftValue(
      fieldId,
      getArtTableRows(draft[fieldId]).filter(row => row.id !== rowId),
    );
  }

  function renderSpeciesObservationInput(fieldId: string, row: ArtTableRow) {
    if (row.registrationMode === 'count') {
      return (
        <View style={styles.artColumnInputGroup}>
          <Text style={styles.repeaterFieldLabel}>Antal</Text>
          <TextInput
            keyboardType="numeric"
            onChangeText={text => updateArtRow(fieldId, row.id, 'antal', text)}
            placeholder="Antal"
            placeholderTextColor="#8e8579"
            style={styles.artValueInput}
            value={row.antal ?? ''}
          />
        </View>
      );
    }

    if (row.registrationMode === 'area') {
      return (
        <View style={styles.artColumnInputGroup}>
          <Text style={styles.repeaterFieldLabel}>m2</Text>
          <TextInput
            keyboardType="numeric"
            onChangeText={text => updateArtRow(fieldId, row.id, 'm2', text)}
            placeholder="m2"
            placeholderTextColor="#8e8579"
            style={styles.artValueInput}
            value={row.m2 ?? ''}
          />
        </View>
      );
    }

    const present = row.finns !== '0';
    return (
      <Pressable
        accessibilityLabel="Arten finns"
        accessibilityRole="checkbox"
        onPress={() => updateArtRow(fieldId, row.id, 'finns', present ? '0' : '1')}
        style={styles.presenceToggle}>
        <View style={[styles.presenceCheckbox, present && styles.presenceCheckboxChecked]} />
        <Text style={styles.presenceToggleText}>Finns</Text>
      </Pressable>
    );
  }

  function renderArtTableField(field: BasicDataField) {
    const categoryOption = getArtCategoryOption(field);
    const category = categoryOption?.value ?? (typeof field.category === 'string' ? field.category : null);
    const entryMode = categoryOption?.entry_mode;
    const isSpeciesObservation = entryMode === 'species_observation';
    const columns = getArtTableColumns(field, categoryOption);
    const nameColumn = getArtNameColumn(columns);
    const rows = getArtTableRows(draft[field.id]);
    const artRows = category ? artLists[category] ?? [] : [];
    const query = artSearchByField[field.id]?.trim().toLowerCase() ?? '';
    const filteredArtRows = artRows
      .filter(art => {
        if (!query) {
          return true;
        }

        return [art.family, art.scientificName, art.swedishName].some(value => value.toLowerCase().includes(query));
      })
      .slice(0, 60);

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {!category ? (
          <Text style={styles.fieldHelp}>Välj artkategori först.</Text>
        ) : (
          <>
            <Text style={styles.fieldHelp}>
              {categoryOption?.label ?? field.label}: sök fram en art och lägg till den i tabellen.
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={text => setArtSearchByField(prev => ({...prev, [field.id]: text}))}
              placeholder="Sök svenskt namn, vetenskapligt namn eller familj"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={artSearchByField[field.id] ?? ''}
            />
            <View style={styles.artSearchList}>
              {filteredArtRows.length > 0 ? (
                filteredArtRows.map(art => (
                  <Pressable
                    key={art.id}
                    onPress={() => addArtRow(field, art, columns, category, entryMode)}
                    style={styles.artSearchItem}>
                    <Text style={styles.artSearchName}>{art.swedishName || art.scientificName}</Text>
                    <Text style={styles.artSearchMeta}>
                      {art.scientificName} | {art.family}
                      {isSpeciesObservation
                        ? ` | ${art.registrationMode === 'count' ? 'Antal' : art.registrationMode === 'area' ? 'm2' : 'Finns'}`
                        : ''}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.fieldHelp}>Inga arter hittades i lokal artlista.</Text>
              )}
            </View>
          </>
        )}

        {rows.length > 0 ? (
          <View style={styles.artTableList}>
            {rows.map(row => (
              <View key={row.id} style={styles.artTableRowCard}>
                <View style={styles.repeaterRowHeader}>
                  <View style={styles.photoPreviewMeta}>
                    <Text style={styles.repeaterRowTitle}>{row[nameColumn] || row.swedishName || row.scientificName}</Text>
                    <Text style={styles.artSearchMeta}>{row.scientificName}</Text>
                  </View>
                  <Pressable onPress={() => removeArtRow(field.id, row.id)} style={styles.smallDangerButton}>
                    <Text style={styles.smallDangerButtonText}>Ta bort</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.artColumnRow}>
                    {isSpeciesObservation
                      ? renderSpeciesObservationInput(field.id, row)
                      : columns
                          .filter(column => column !== nameColumn)
                          .map(column => (
                            <View key={`${row.id}-${column}`} style={styles.artColumnInputGroup}>
                              <Text style={styles.repeaterFieldLabel}>{formatConfigLabel(column)}</Text>
                              <TextInput
                                onChangeText={text => updateArtRow(field.id, row.id, column, text)}
                                placeholder="Värde"
                                placeholderTextColor="#8e8579"
                                style={styles.artValueInput}
                                value={row[column] ?? ''}
                              />
                            </View>
                          ))}
                  </View>
                </ScrollView>
                <Text style={styles.artCoordinateText}>
                  Koordinat: {row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : 'saknas'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.fieldHelp}>Inga arter tillagda ännu.</Text>
        )}
      </View>
    );
  }

  function renderInventoryUuidField(field: BasicDataField) {
    const role = draft.inventering_roll;
    const inventerareCount = draft.antal_inventerare;
    const sessionUuid = typeof draft.inventering_uuid === 'string' ? draft.inventering_uuid : '';
    const hasValidUuid = isValidUuid(sessionUuid);
    const qrPayload = hasValidUuid ? createSessionQrPayload(sessionUuid) : null;

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Text style={styles.fieldHelp}>
          Alla som arbetar i samma transekt ska använda samma UUID så att servern kan slå ihop delarna till ett
          inventeringstillfälle.
        </Text>

        <View style={styles.sessionMetaBox}>
          <Text style={styles.sessionMetaLabel}>Roll</Text>
          <Text style={styles.sessionMetaValue}>
            {role === 'master' ? 'Master' : role === 'hjalpare' ? 'Hjälpare' : 'Inte vald ännu'}
          </Text>
          <Text style={styles.sessionMetaLabel}>Antal inventerare</Text>
          <Text style={styles.sessionMetaValue}>
            {typeof inventerareCount === 'string' ? inventerareCount : 'Inte angivet'}
          </Text>
        </View>

        <Text style={styles.uuidLabel}>UUID</Text>
        <Text selectable style={styles.uuidValue}>
          {sessionUuid || 'Inget UUID valt ännu'}
        </Text>

        {role === 'master' ? (
          <>
            <View style={styles.inlineActions}>
              <Pressable onPress={createFreshSessionUuid} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{hasValidUuid ? 'Skapa nytt UUID' : 'Skapa UUID'}</Text>
              </Pressable>
            </View>

            {qrPayload ? (
              <View style={styles.qrCard}>
                <Text style={styles.qrTitle}>Visa denna QR-kod för övriga inventerare</Text>
                <QRCode value={qrPayload} size={180} />
                <Text style={styles.qrHelp}>
                  Hjälparna skannar koden så att alla skickar upp samma inventeringstillfälle.
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.fieldHelp}>
              Skanna master-koden eller klistra in UUID manuellt om ni arbetar flera personer i samma inventering.
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setManualUuidInput}
              placeholder="Klistra in UUID eller skanna QR-kod"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={manualUuidInput}
            />
            <View style={styles.inlineActions}>
              <Pressable onPress={() => applySessionUuid(manualUuidInput, 'manual')} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Använd UUID</Text>
              </Pressable>
              <Pressable onPress={() => openScanner().catch(() => undefined)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Skanna QR-kod</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    );
  }

  function renderField(field: BasicDataField) {
    const value = draft[field.id];

    switch (field.type) {
      case 'text':
      case 'integer':
      case 'decimal':
      case 'multiline_text':
        return renderDialogField(field, value);
      case 'select':
      case 'boolean_select':
        return renderDialogField(field, value);
      case 'dataset_select':
        return renderDatasetSelect(field, value);
      case 'dataset_value':
        return renderDatasetValue(field);
      case 'gps_capture':
        return (
          <View key={field.id} style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Text style={styles.fieldHelp}>Hämtar koordinater från telefonens GPS.</Text>
            <Pressable
              onPress={() => {
                refreshGps().catch(() => {
                  // GPS-felet visas i statusrutan
                });
              }}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Hämta GPS-position</Text>
            </Pressable>
            <Text style={styles.valueText}>{gps.message}</Text>
          </View>
        );
      case 'inventory_uuid':
        return renderInventoryUuidField(field);
      case 'photo_single':
        return renderPhotoSingleField(field);
      case 'photo_set':
        return renderPhotoSetField(field);
      case 'photo_repeater':
        return renderPhotoRepeaterField(field);
      case 'repeater':
        return renderRepeaterField(field);
      case 'fixed_repeater':
        return renderRepeaterField(field, true);
      case 'matrix_percent':
        return renderMatrixPercentField(field);
      case 'resource_picker':
        return renderResourcePickerField(field);
      case 'art_table':
        return renderArtTableField(field);
      default:
        return (
          <View key={field.id} style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Text style={styles.fieldHelp}>
              Fälttypen `{field.type}` är definierad men renderas som specialkomponent i nästa steg.
            </Text>
          </View>
        );
    }
  }

  function renderDatasetSelect(field: BasicDataField, value: unknown) {
    const datasetRows = field.dataset ? datasets[field.dataset] ?? [] : [];
    const filteredRows = filterDatasetRows(field, datasetRows, draft);
    const valueKey = field.value_key ?? 'id';
    const displayKey = field.display_key ?? valueKey;
    const typedValue = typeof value === 'string' ? value : '';
    const sourceFilterMissing = Boolean(
      field.filters?.some(filter => {
        const sourceValue = draft[filter.source_field];
        return sourceValue == null || sourceValue === '';
      }),
    );
    const options = getUniqueDatasetOptions(filteredRows, valueKey, displayKey)
      .filter(option => {
        if (!typedValue) {
          return true;
        }

        const query = typedValue.toLowerCase();
        return option.value.toLowerCase().includes(query) || option.label.toLowerCase().includes(query);
      })
      .slice(0, 80);
    const isListOpen = openDatasetFieldId === field.id;
    const showNearestPlot = field.id === 'ruta' && nearestPlotMatch && !hasSelectedPlot;

    if (field.id === 'provyta') {
      return (
        <View key={field.id} style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          {sourceFilterMissing ? (
            <Text style={styles.fieldHelp}>Provyta visas när ruta har valts.</Text>
          ) : options.length > 0 ? (
            <View style={styles.optionWrap}>
              {options.map(option => {
                const selected = value === option.value;
                return (
                  <Pressable
                    key={`${field.id}-${option.value}`}
                    onPress={() => {
                      const selectedRow = filteredRows.find(row => row[valueKey] === option.value);
                      if (selectedRow) {
                        selectPlotRow(selectedRow);
                      } else {
                        updateDraftValue(field.id, option.value);
                      }
                    }}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}>
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.fieldHelp}>Inga provytor hittades för vald ruta.</Text>
          )}
        </View>
      );
    }

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {showNearestPlot ? (
          <Pressable
            accessibilityLabel="Välj närmaste provyta"
            accessibilityRole="button"
            onPress={() => selectPlotRow(nearestPlotMatch.row)}
            style={styles.nearestPlotCard}>
            <Text style={styles.nearestPlotTitle}>Närmaste provyta</Text>
            <Text style={styles.nearestPlotText}>
              Ruta {nearestPlotMatch.row.ruta} · Provyta {nearestPlotMatch.row.provyta} ·{' '}
              {nearestPlotMatch.distanceMeters < 1000
                ? `${nearestPlotMatch.distanceMeters.toFixed(0)} m`
                : `${(nearestPlotMatch.distanceMeters / 1000).toFixed(1)} km`}
            </Text>
            <Text style={styles.nearestPlotAction}>Tryck för att använda denna.</Text>
          </Pressable>
        ) : field.id === 'ruta' && !hasSelectedPlot ? (
          <Text style={styles.fieldHelp}>När GPS-position finns visas närmaste ruta och provyta här.</Text>
        ) : null}
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!sourceFilterMissing}
          onBlur={() => {
            setTimeout(() => setOpenDatasetFieldId(current => (current === field.id ? null : current)), 150);
          }}
          onChangeText={text => updateDraftValue(field.id, text.trim())}
          onFocus={() => setOpenDatasetFieldId(field.id)}
          placeholder={sourceFilterMissing ? 'Välj ruta först' : 'Skriv eller välj från listan'}
          placeholderTextColor="#8e8579"
          style={[styles.input, sourceFilterMissing && styles.inputDisabled]}
          value={typedValue}
        />
        {sourceFilterMissing ? (
          <Text style={styles.fieldHelp}>Provyta visas när ruta har valts.</Text>
        ) : isListOpen && options.length > 0 ? (
          <View style={styles.datasetList}>
            {options.map(option => {
              const selected = value === option.value;
              return (
                <Pressable
                  key={`${field.id}-${option.value}`}
                  onPress={() => {
                    updateDraftValue(field.id, option.value);
                    setOpenDatasetFieldId(null);
                  }}
                  style={[styles.datasetListItem, selected && styles.datasetListItemSelected]}>
                  <Text style={[styles.datasetListItemText, selected && styles.datasetListItemTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : !isListOpen && typedValue ? null : (
          <Text style={styles.fieldHelp}>
            Inga val hittades i lokal grunddata. Kontrollera att appen har kopierat eller hämtat datafilerna.
          </Text>
        )}
      </View>
    );
  }

  function renderDatasetValue(field: BasicDataField) {
    const datasetRows = field.dataset ? datasets[field.dataset] ?? [] : [];
    const row = findDatasetRow(field, datasetRows, draft);
    const value = (row && field.value_key ? row[field.value_key] : '') || String(draft[field.id] ?? '');

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Text selectable style={styles.readonlyValue}>
          {value || 'Värdet fylls i när provyta har valts'}
        </Text>
      </View>
    );
  }

  function renderInventoryActionCard() {
    if (!hasSelectedPlot) {
      return null;
    }

    const status = draft.status === 'markerad_klar' ? 'Markerad klar' : 'Ny';
    const selectedType = basicData?.lists.inventeringstyper?.find(option => option.value === draft.inventeringstyp);

    return (
      <View style={styles.inventoryActionCard}>
        <Text style={styles.inventoryActionTitle}>Provytans ID: {String(draft.pyid ?? '-')}</Text>
        <View style={styles.inventoryStatusRow}>
          <Text style={styles.inventoryStatusMark}>✓</Text>
          <Text style={styles.inventoryStatusText}>Status: {status}</Text>
        </View>
        <Text style={styles.fieldHelp}>
          Vald åtgärd: {selectedType?.label ?? 'Ingen åtgärd vald ännu'}
        </Text>
        <Pressable onPress={handleExecuteInventoryChoice} style={styles.executeButton}>
          <Text style={styles.executeButtonText}>Utför</Text>
        </Pressable>
      </View>
    );
  }

  function renderPlotMapButton() {
    return (
      <View style={styles.plotMapButtonCard}>
        <Text style={styles.fieldLabel}>Välj via karta</Text>
        <Text style={styles.fieldHelp}>Visa alla provytor från data.csv och skapa inventering genom att trycka på en punkt.</Text>
        <Pressable onPress={() => setShowPlotMapModal(true)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Öppna provytekarta</Text>
        </Pressable>
      </View>
    );
  }

  function getPlotSelectionRegion(rows: Record<string, string>[]) {
    if (typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      return {
        latitude: gps.latitude,
        longitude: gps.longitude,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      };
    }

    const fallbackRow = nearestPlotMatch?.row ?? rows.find(row => parseNumber(row.latitud) != null && parseNumber(row.longitud) != null);
    const fallbackLat = parseNumber(fallbackRow?.latitud);
    const fallbackLon = parseNumber(fallbackRow?.longitud);

    return {
      latitude: fallbackLat ?? 59.5,
      longitude: fallbackLon ?? 18,
      latitudeDelta: 0.18,
      longitudeDelta: 0.18,
    };
  }

  function renderPlotSelectionMap() {
    const rows = datasets.provyteunderlag ?? [];
    const visibleRows = rows.filter(row => parseNumber(row.latitud) != null && parseNumber(row.longitud) != null);
    const userCoordinate =
      typeof gps.latitude === 'number' && typeof gps.longitude === 'number'
        ? {latitude: gps.latitude, longitude: gps.longitude}
        : null;

    if (visibleRows.length === 0) {
      return (
        <View style={styles.mapEmptyState}>
          <Text style={styles.fieldHelp}>Inga provytor med koordinater hittades i data.csv.</Text>
        </View>
      );
    }

    return (
      <View style={styles.plotSelectionMapWrap}>
        <MapView
          initialRegion={getPlotSelectionRegion(visibleRows)}
          mapType={Platform.OS === 'android' ? 'none' : 'standard'}
          rotateEnabled
          scrollEnabled
          showsCompass
          showsScale
          showsUserLocation
          style={styles.transectMap}
          zoomControlEnabled
          zoomEnabled>
          {Platform.OS === 'android' ? (
            <UrlTile maximumZ={19} tileSize={256} urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          ) : null}
          {visibleRows.map((row, index) => {
            const latitude = parseNumber(row.latitud) ?? 0;
            const longitude = parseNumber(row.longitud) ?? 0;
            const selected = row.ruta === ruta && row.provyta === provyta;
            return (
              <Marker
                key={`${row.pyid || `${row.ruta}-${row.provyta}`}-${index}`}
                coordinate={{latitude, longitude}}
                onPress={() => promptCreateInventoryFromMap(row)}
                pinColor={selected ? 'blue' : 'green'}
                title={`Ruta ${row.ruta}, provyta ${row.provyta}`}
              />
            );
          })}
          {userCoordinate ? <Marker coordinate={userCoordinate} pinColor="red" title="Din GPS-position" /> : null}
        </MapView>
      </View>
    );
  }

  function renderTransectMap() {
    const startLat = parseNumber(selectedPlotRow?.latitud);
    const startLon = parseNumber(selectedPlotRow?.longitud);
    const lengthMeters = parseNumber(selectedPlotRow?.transektlen);
    const bearingDegrees = parseNumber(selectedPlotRow?.transektriktning);

    if (!selectedPlotRow || startLat == null || startLon == null || lengthMeters == null || bearingDegrees == null) {
      return (
        <View style={styles.mapEmptyState}>
          <Text style={styles.fieldHelp}>Välj en provyta med koordinater, transektlängd och transektriktning först.</Text>
        </View>
      );
    }

    const start: MapPoint = {x: 0, y: 0};
    const end = getTransectEndPoint(lengthMeters, bearingDegrees);
    const startCoordinate = relativeMetersToLatLon(startLat, startLon, start);
    const endCoordinate = relativeMetersToLatLon(startLat, startLon, end);
    const userCoordinate =
      gps.latitude != null && gps.longitude != null
        ? {
            latitude: gps.latitude,
            longitude: gps.longitude,
          }
        : null;
    const coordinates = [startCoordinate, endCoordinate, ...(userCoordinate ? [userCoordinate] : [])];
    const minLat = Math.min(...coordinates.map(coordinate => coordinate.latitude));
    const maxLat = Math.max(...coordinates.map(coordinate => coordinate.latitude));
    const minLon = Math.min(...coordinates.map(coordinate => coordinate.longitude));
    const maxLon = Math.max(...coordinates.map(coordinate => coordinate.longitude));
    const latitudeDelta = Math.max((maxLat - minLat) * 2.2, 0.002);
    const longitudeDelta = Math.max((maxLon - minLon) * 2.2, 0.002);
    const region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta,
      longitudeDelta,
    };

    return (
      <View>
        <View style={styles.mapCanvasWrap}>
          <MapView
            initialRegion={region}
            mapType={Platform.OS === 'android' ? 'none' : 'standard'}
            rotateEnabled
            scrollEnabled
            showsCompass
            showsScale
            showsUserLocation
            style={styles.transectMap}
            zoomControlEnabled
            zoomEnabled>
            {Platform.OS === 'android' ? (
              <UrlTile maximumZ={19} tileSize={256} urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            ) : null}
            <Polyline coordinates={[startCoordinate, endCoordinate]} strokeColor="#165d3c" strokeWidth={6} />
            <Marker coordinate={startCoordinate} pinColor="green" title="Start" />
            <Marker coordinate={endCoordinate} pinColor="green" title="Slut" />
            {userCoordinate ? <Marker coordinate={userCoordinate} pinColor="red" title="Din GPS-position" /> : null}
          </MapView>
        </View>

        <View style={styles.mapMetaGrid}>
          <Text style={styles.modalLine}>Grön linje: transekt. Röd markör: din GPS-position.</Text>
          <Text style={styles.modalLine}>Ruta: {ruta || '-'}</Text>
          <Text style={styles.modalLine}>Provyta: {provyta || '-'}</Text>
          <Text style={styles.modalLine}>Längd: {lengthMeters} m</Text>
          <Text style={styles.modalLine}>Riktning: {bearingDegrees} grader</Text>
          <Text style={styles.modalLine}>Start: {startLat.toFixed(6)}, {startLon.toFixed(6)}</Text>
          <Text style={styles.modalLine}>
            Din GPS: {userCoordinate ? `${gps.latitude?.toFixed(6)}, ${gps.longitude?.toFixed(6)}` : gps.message}
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading || !basicData) {
    return (
      <SafeAreaView style={[styles.loadingScreen, {paddingTop: insets.top}]}> 
        <ActivityIndicator color="#165d3c" size="large" />
        <Text style={styles.loadingTitle}>Strand startar</Text>
        <Text style={styles.loadingText}>{statusText}</Text>
      </SafeAreaView>
    );
  }

  const activeTab = basicData.tabs.find(tab => tab.id === activeTabId) ?? basicData.tabs[0];
  const overviewTab = basicData.tabs.find(tab => tab.id === 'oversikt') ?? basicData.tabs[0];
  const isDistanceInventory = draft.inventeringstyp === 'distans';
  const hiddenMainTabIds = new Set<string>(isDistanceInventory ? [NORMAL_INVENTORY_TAB_ID] : []);
  const menuTabs = hasSelectedPlot
    ? basicData.tabs.filter(tab => HEADER_MENU_TAB_IDS.has(tab.id) && tab.id !== 'ej_inventerad')
    : [];
  const visibleTabs = hasSelectedPlot
    ? basicData.tabs.filter(
        tab =>
          !hiddenMainTabIds.has(tab.id) &&
          (!HEADER_MENU_TAB_IDS.has(tab.id) || (tab.id === 'ej_inventerad' && draft.inventeringstyp === 'ej_inventerad')),
      )
    : basicData.tabs.filter(tab => tab.id === 'oversikt');
  const visibleActiveTab = hasSelectedPlot
    ? hiddenMainTabIds.has(activeTab.id)
      ? basicData.tabs.find(tab => tab.id === DISTANCE_INVENTORY_TAB_ID) ?? activeTab
      : activeTab
    : overviewTab;
  const shouldShowSideTabs = hasSelectedPlot && visibleActiveTab.id !== overviewTab.id;
  const tabContent = (
    <View style={styles.tabContainer}>
      <Text style={styles.tabTitle}>{visibleActiveTab.label}</Text>
      {visibleActiveTab.sections.map(section => (
        <View key={section.id} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{section.label}</Text>
          {section.fields.map(fieldOrId => {
            const field = resolveField(fieldOrId);
            if (
              !field ||
              USER_SETUP_FIELD_IDS.has(field.id) ||
              (!hasSelectedPlot && REQUIRES_SELECTED_PLOT_FIELD_IDS.has(field.id))
            ) {
              return null;
            }
            return renderField(field);
          })}
          {section.id === 'provyta_val' ? (
            <>
              {renderPlotMapButton()}
              {renderInventoryActionCard()}
            </>
          ) : null}
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader
        gps={gps}
        inventerare={inventerare}
        lagnummer={lagnummer}
        onPressMenu={() => setShowNavigationMenu(true)}
        onPressGps={() => setShowGpsModal(true)}
        onPressMap={() => setShowMapModal(true)}
        onPressUser={openUserSettings}
        provyta={provyta}
        ruta={ruta}
      />
      {toastMessage ? (
        <View pointerEvents="none" style={styles.toastContainer}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}
      {transectDistanceMeters != null && transectDistanceMeters > 25 ? (
        <View style={styles.transectWarningBanner}>
          <Text style={styles.transectWarningText}>
            Du är {transectDistanceMeters.toFixed(0)} m från transektens linje.
          </Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {shouldShowSideTabs ? (
          <View style={styles.inventoryLayout}>
            <View style={styles.sideTabRail}>
              {visibleTabs.map(tab => {
                const selected = tab.id === visibleActiveTab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setActiveTabId(tab.id)}
                    style={[styles.sideTab, selected && styles.sideTabSelected]}>
                    <Text style={[styles.sideTabText, selected && styles.sideTabTextSelected]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.inventoryContent}>{tabContent}</View>
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
              {visibleTabs.map(tab => {
                const selected = tab.id === visibleActiveTab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setActiveTabId(tab.id)}
                    style={[styles.tabChip, selected && styles.tabChipSelected]}>
                    <Text style={[styles.tabChipText, selected && styles.tabChipTextSelected]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {tabContent}
          </>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => {
          if (hasUserSetup) {
            setShowUserModal(false);
          }
        }}
        transparent
        visible={showUserModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Lag och inventerare</Text>
            <Text style={styles.fieldHelp}>Ange uppgifterna innan inventeringen fortsätter.</Text>

            <Text style={styles.fieldLabel}>Lagnummer</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={setLagnummerInput}
              placeholder="Ange lagnummer"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={lagnummerInput}
            />

            <Text style={[styles.fieldLabel, styles.modalFieldLabel]}>Inventerare</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setInventerareInput}
              placeholder="Ange inventerare"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={inventerareInput}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={saveUserSettings} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Spara</Text>
              </Pressable>
              {hasUserSetup ? (
                <Pressable onPress={() => setShowUserModal(false)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Avbryt</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setEditingField(null)}
        transparent
        visible={Boolean(editingField)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {editingField ? (
              <>
                <Text style={styles.modalTitle}>{editingField.field.label}</Text>
                {editingField.field.type === 'select' || editingField.field.type === 'boolean_select' ? (
                  <View style={styles.dialogOptionList}>
                    {(editingField.field.list_id ? basicData.lists[editingField.field.list_id] ?? [] : []).map(option => {
                      const optionValue = option.value ?? option.id ?? option.label;
                      const selected = editingField.value === optionValue;
                      return (
                        <Pressable
                          key={`${editingField.field.id}-${optionValue}`}
                          onPress={() => setEditingField(prev => (prev ? {...prev, value: optionValue} : prev))}
                          style={[styles.dialogOption, selected && styles.dialogOptionSelected]}>
                          <View style={[styles.dialogRadio, selected && styles.dialogRadioSelected]} />
                          <Text style={[styles.dialogOptionText, selected && styles.dialogOptionTextSelected]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <TextInput
                    autoFocus
                    keyboardType={
                      editingField.field.type === 'integer' || editingField.field.type === 'decimal'
                        ? 'numeric'
                        : 'default'
                    }
                    multiline={editingField.field.type === 'multiline_text'}
                    onChangeText={text => setEditingField(prev => (prev ? {...prev, value: text} : prev))}
                    placeholder={editingField.field.unit ? `Ange värde (${editingField.field.unit})` : 'Ange värde'}
                    placeholderTextColor="#8e8579"
                    style={[
                      styles.input,
                      editingField.field.type === 'multiline_text' && styles.multilineInput,
                    ]}
                    value={editingField.value}
                  />
                )}

                <View style={styles.modalActions}>
                  <Pressable onPress={() => setEditingField(null)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Avbryt</Text>
                  </Pressable>
                  <Pressable onPress={saveFieldEditor} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Spara</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={showGpsModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>GPS-status</Text>
            <Text style={styles.modalLine}>Status: {gps.status}</Text>
            <Text style={styles.modalLine}>Meddelande: {gps.message}</Text>
            <Text style={styles.modalLine}>Latitud: {gps.latitude ?? '-'}</Text>
            <Text style={styles.modalLine}>Longitud: {gps.longitude ?? '-'}</Text>
            <Text style={styles.modalLine}>Noggrannhet: {gps.accuracy ? `${gps.accuracy.toFixed(1)} m` : '-'}</Text>
            <Text style={styles.modalLine}>
              Senaste uppdatering: {gps.timestamp ? new Date(gps.timestamp).toLocaleString('sv-SE') : '-'}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  refreshGps().catch(() => {
                    // GPS-felet visas i statusrutan
                  });
                }}
                style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Uppdatera GPS</Text>
              </Pressable>
              <Pressable onPress={() => setShowGpsModal(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Stäng</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowMapModal(false)} visible={showMapModal}>
        <SafeAreaView style={styles.mapScreen}>
          <View style={styles.mapHeader}>
            <View style={styles.photoPreviewMeta}>
              <Text style={styles.modalTitle}>Karta</Text>
              <Text style={styles.fieldHelp}>Transekt och aktuell GPS-position för vald provyta.</Text>
            </View>
            <Pressable accessibilityLabel="Stäng karta" onPress={() => setShowMapModal(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.mapContent}>
            {renderTransectMap()}
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  refreshGps().catch(() => {
                    // GPS-felet visas i statusrutan
                  });
                }}
                style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Uppdatera GPS</Text>
              </Pressable>
              <Pressable onPress={() => setShowMapModal(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Stäng</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowPlotMapModal(false)} visible={showPlotMapModal}>
        <SafeAreaView style={styles.mapScreen}>
          <View style={styles.mapHeader}>
            <View style={styles.photoPreviewMeta}>
              <Text style={styles.modalTitle}>Välj provyta</Text>
              <Text style={styles.fieldHelp}>Tryck på en provytepunkt för att skapa inventering.</Text>
            </View>
            <Pressable accessibilityLabel="Stäng provytekarta" onPress={() => setShowPlotMapModal(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <View style={styles.fullMapContent}>{renderPlotSelectionMap()}</View>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowInventoryListModal(false)} visible={showInventoryListModal}>
        <SafeAreaView style={styles.mapScreen}>
          <View style={styles.mapHeader}>
            <View style={styles.photoPreviewMeta}>
              <Text style={styles.modalTitle}>Inventeringar</Text>
              <Text style={styles.fieldHelp}>Hantera provytor som finns lokalt på telefonen.</Text>
            </View>
            <Pressable
              accessibilityLabel="Stäng inventeringslista"
              onPress={() => setShowInventoryListModal(false)}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.inventoryListContent}>
            {inventories.length === 0 ? (
              <View style={styles.mapEmptyState}>
                <Text style={styles.fieldHelp}>Inga lokala inventeringar ännu.</Text>
              </View>
            ) : (
              inventories.map(item => (
                <View key={item.id} style={styles.inventoryListItem}>
                  <View style={styles.photoPreviewMeta}>
                    <Text style={styles.inventoryListTitle}>Ruta {item.ruta} · Provyta {item.provyta}</Text>
                    <Text style={styles.inventoryListMeta}>Filbas: {item.id}</Text>
                    <Text style={styles.inventoryListMeta}>
                      Status: {item.status} · Uppdaterad {new Date(item.updatedAt).toLocaleString('sv-SE')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Radera inventering?',
                        'All data, JSON-export och alla foton för inventeringen raderas från telefonen.',
                        [
                          {text: 'Avbryt', style: 'cancel'},
                          {text: 'Ja', style: 'destructive', onPress: () => openDeleteInventory(item)},
                        ],
                      )
                    }
                    style={styles.smallDangerButton}>
                    <Text style={styles.smallDangerButtonText}>Radera</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setDeleteInventoryTarget(null)}
        transparent
        visible={Boolean(deleteInventoryTarget)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Bekräfta radering</Text>
            <Text style={styles.fieldHelp}>
              Skriv RADERA för att ta bort all lokal data och alla foton för inventeringen.
            </Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setDeleteInventoryInput}
              placeholder="RADERA"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={deleteInventoryInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setDeleteInventoryTarget(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Avbryt</Text>
              </Pressable>
              <Pressable
                disabled={deleteInventoryInput !== 'RADERA'}
                onPress={() => confirmDeleteInventory().catch(() => undefined)}
                style={[styles.primaryDangerButton, deleteInventoryInput !== 'RADERA' && styles.menuItemDisabled]}>
                <Text style={styles.primaryButtonText}>Radera</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setShowNavigationMenu(false)}
        transparent
        visible={showNavigationMenu}>
        <View style={styles.modalBackdrop}>
          <View style={styles.menuModalCard}>
            <View style={styles.menuHeader}>
              <Text style={[styles.modalTitle, styles.menuTitle]}>Meny</Text>
              <Pressable
                accessibilityLabel="Stäng meny"
                onPress={() => setShowNavigationMenu(false)}
                style={styles.closeButton}>
                <Text style={styles.closeButtonText}>X</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.menuSectionTitle}>Data</Text>
              <View style={styles.menuList}>
                <Pressable
                  onPress={() => {
                    setShowNavigationMenu(false);
                    setShowInventoryListModal(true);
                  }}
                  style={styles.menuItem}>
                  <Text style={styles.menuItemText}>Inventeringar</Text>
                </Pressable>
                <Pressable
                  disabled={isUpdating}
                  onPress={() => {
                    setShowNavigationMenu(false);
                    handleManualUpdate().catch(() => {
                      // handleManualUpdate visar redan felmeddelande
                    });
                  }}
                  style={[styles.menuItem, isUpdating && styles.menuItemDisabled]}>
                  <Text style={styles.menuItemText}>{isUpdating ? 'Uppdaterar...' : 'Uppdatera basdata'}</Text>
                </Pressable>
                <Pressable
                  disabled={isExporting}
                  onPress={() => {
                    setShowNavigationMenu(false);
                    handleManualExport().catch(() => undefined);
                  }}
                  style={[styles.menuItem, isExporting && styles.menuItemDisabled]}>
                  <Text style={styles.menuItemText}>{isExporting ? 'Exporterar...' : 'Skapa JSON-export'}</Text>
                </Pressable>
              </View>

              <Text style={styles.menuSectionTitle}>Övrigt</Text>
              <View style={styles.menuList}>
                {menuTabs.length > 0 ? (
                  menuTabs.map(tab => {
                    const selected = tab.id === activeTab.id;
                    return (
                      <Pressable
                        key={tab.id}
                        onPress={() => {
                          setActiveTabId(tab.id);
                          setShowNavigationMenu(false);
                        }}
                        style={[styles.menuItem, selected && styles.menuItemSelected]}>
                        <Text style={[styles.menuItemText, selected && styles.menuItemTextSelected]}>{tab.label}</Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.fieldHelp}>Välj ruta och provyta först.</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" visible={Boolean(photoCaptureTarget)}>
        <SafeAreaView style={styles.cameraScreen}>
          <View style={styles.cameraHeader}>
            <Text style={styles.modalTitle}>{photoCaptureTarget?.label ?? 'Ta bild'}</Text>
            <Text style={styles.fieldHelp}>
              Bilden sparas i telefonens publika Strand-mapp och kopplas till aktuell provyta.
            </Text>
          </View>

          <View style={styles.cameraCard}>
            <Camera
              cameraType={CameraType.Back}
              ref={photoCameraRef}
              shutterPhotoSound
              style={styles.photoCamera}
            />
          </View>

          <View style={styles.cameraActions}>
            <Pressable disabled={isCapturingPhoto} onPress={() => capturePhoto().catch(() => undefined)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{isCapturingPhoto ? 'Sparar...' : 'Ta bild'}</Text>
            </Pressable>
            <Pressable
              disabled={isCapturingPhoto}
              onPress={() => setPhotoCaptureTarget(null)}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Avbryt</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" visible={showScannerModal}>
        <SafeAreaView style={styles.scannerScreen}>
          <View style={styles.scannerHeader}>
            <Text style={styles.modalTitle}>Skanna master-kod</Text>
            <Text style={styles.fieldHelp}>
              Rikta kameran mot QR-koden i master-enheten. När koden lästs in sparas samma inventeringstillfälle i din
              app.
            </Text>
          </View>

          <View style={styles.scannerCard}>
            <Camera
              cameraType={CameraType.Back}
              frameColor="#f5efe4"
              laserColor="#1d7a50"
              onReadCode={event => applySessionUuid(event.nativeEvent.codeStringValue, 'scan')}
              scanBarcode
              showFrame
              style={styles.scannerCamera}
            />
          </View>

          <View style={styles.modalActions}>
            <Pressable onPress={() => setShowScannerModal(false)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Avbryt</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#f4efe7',
    flex: 1,
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#f4efe7',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingTitle: {
    color: '#14231a',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 20,
  },
  loadingText: {
    color: '#6f675c',
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  toastContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#a63a2b',
    borderRadius: 10,
    elevation: 8,
    justifyContent: 'center',
    left: 16,
    minHeight: 62,
    paddingHorizontal: 20,
    paddingVertical: 16,
    position: 'absolute',
    right: 16,
    top: 78,
    zIndex: 20,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  transectWarningBanner: {
    backgroundColor: '#fff7dd',
    borderBottomColor: '#d7b65d',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  transectWarningText: {
    color: '#5c4300',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  banner: {
    backgroundColor: '#fff7dd',
    borderColor: '#ead7a3',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  bannerTitle: {
    color: '#3f3415',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  bannerText: {
    color: '#5a4d2d',
    fontSize: 14,
    lineHeight: 20,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#165d3c',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cdbdab',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#24352a',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryDangerButton: {
    alignItems: 'center',
    backgroundColor: '#a63a2b',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  noticeBox: {
    backgroundColor: '#eef6ee',
    borderColor: '#cfe3cf',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  noticeText: {
    color: '#2f4f36',
    fontSize: 14,
    lineHeight: 20,
  },
  tabBar: {
    gap: 6,
    paddingBottom: 10,
  },
  tabChip: {
    backgroundColor: '#e5ddd2',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  tabChipSelected: {
    backgroundColor: '#213127',
  },
  tabChipText: {
    color: '#4b453d',
    fontSize: 12,
    fontWeight: '600',
  },
  tabChipTextSelected: {
    color: '#ffffff',
  },
  inventoryLayout: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  sideTabRail: {
    backgroundColor: '#d8d4cb',
    borderColor: '#c9beb0',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    width: 106,
  },
  sideTab: {
    alignItems: 'center',
    borderBottomColor: '#c2b8aa',
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 74,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  sideTabSelected: {
    backgroundColor: '#d7e5e0',
  },
  sideTabText: {
    color: '#26231f',
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  sideTabTextSelected: {
    color: '#0f3f2d',
    fontWeight: '800',
  },
  inventoryContent: {
    flex: 1,
  },
  tabContainer: {
    gap: 16,
  },
  tabTitle: {
    color: '#14231a',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  sectionCard: {
    backgroundColor: '#fffaf2',
    borderColor: '#ddd0c0',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    color: '#213127',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  fieldCard: {
    backgroundColor: '#ffffff',
    borderColor: '#eadfce',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  promptFieldRow: {
    alignItems: 'center',
    backgroundColor: '#dfe9e5',
    borderBottomColor: '#25231f',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  promptFieldIcon: {
    color: '#111111',
    fontSize: 28,
    fontWeight: '800',
    marginRight: 9,
    textAlign: 'center',
    width: 34,
  },
  promptFieldTextBlock: {
    flex: 1,
  },
  promptFieldLabel: {
    color: '#111111',
    fontSize: 22,
    lineHeight: 28,
    textDecorationLine: 'underline',
  },
  promptFieldValue: {
    color: '#4f4a43',
    fontSize: 13,
    marginTop: 3,
  },
  fieldLabel: {
    color: '#213127',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  fieldHelp: {
    color: '#6f675c',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  nearestPlotCard: {
    backgroundColor: '#eef6ee',
    borderColor: '#9fc3a9',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  nearestPlotTitle: {
    color: '#165d3c',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  nearestPlotText: {
    color: '#213127',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  nearestPlotAction: {
    color: '#3f7d63',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  input: {
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    color: '#17261d',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputInvalid: {
    borderColor: '#a63a2b',
    borderWidth: 2,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    opacity: 0.55,
  },
  datasetList: {
    backgroundColor: '#fffaf2',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    maxHeight: 260,
    overflow: 'hidden',
  },
  datasetListItem: {
    borderBottomColor: '#eadfce',
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datasetListItemSelected: {
    backgroundColor: '#165d3c',
  },
  datasetListItemText: {
    color: '#24352a',
    fontSize: 15,
    fontWeight: '600',
  },
  datasetListItemTextSelected: {
    color: '#ffffff',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    backgroundColor: '#f1ebe1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionChipSelected: {
    backgroundColor: '#165d3c',
  },
  optionChipText: {
    color: '#4b453d',
    fontSize: 13,
    fontWeight: '600',
  },
  optionChipTextSelected: {
    color: '#ffffff',
  },
  valueText: {
    color: '#4b453d',
    fontSize: 13,
    marginTop: 10,
  },
  inventoryActionCard: {
    backgroundColor: '#ffffff',
    borderColor: '#213127',
    borderRadius: 4,
    borderWidth: 2,
    marginTop: 4,
    padding: 16,
  },
  plotMapButtonCard: {
    backgroundColor: '#eef6ee',
    borderColor: '#cfe3cf',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  inventoryActionTitle: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 14,
  },
  inventoryStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  inventoryStatusMark: {
    color: '#00d83a',
    fontSize: 34,
    fontWeight: '900',
  },
  inventoryStatusText: {
    color: '#37443c',
    fontSize: 18,
    fontWeight: '600',
  },
  executeButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#e0e0e0',
    borderColor: '#b8b8b8',
    borderRadius: 3,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 132,
    paddingHorizontal: 20,
  },
  executeButtonText: {
    color: '#111111',
    fontSize: 28,
    fontWeight: '500',
  },
  sessionMetaBox: {
    backgroundColor: '#f8f3eb',
    borderColor: '#e0d3c2',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  sessionMetaLabel: {
    color: '#6f675c',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sessionMetaValue: {
    color: '#213127',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  uuidLabel: {
    color: '#6f675c',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  uuidValue: {
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    color: '#17261d',
    fontSize: 14,
    padding: 12,
  },
  readonlyValue: {
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    color: '#17261d',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  photoSetGrid: {
    gap: 12,
  },
  photoSetItem: {
    gap: 10,
  },
  photoSetTakenSlot: {
    alignItems: 'center',
    backgroundColor: '#f8f3eb',
    borderColor: '#e0d3c2',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  photoSetImage: {
    backgroundColor: '#ddd0c0',
    borderRadius: 8,
    height: 86,
    width: 86,
  },
  photoSetMeta: {
    flex: 1,
  },
  photoSetHint: {
    color: '#3f7d63',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 5,
  },
  photoPreviewCard: {
    alignItems: 'center',
    backgroundColor: '#f8f3eb',
    borderColor: '#e0d3c2',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    padding: 10,
  },
  photoPreviewImage: {
    backgroundColor: '#ddd0c0',
    borderRadius: 8,
    height: 72,
    width: 72,
  },
  photoPreviewMeta: {
    flex: 1,
  },
  photoPreviewTitle: {
    color: '#213127',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  photoPreviewText: {
    color: '#6f675c',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyPhotoSlot: {
    backgroundColor: '#f8f3eb',
    borderColor: '#e0d3c2',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 12,
  },
  emptyPhotoSlotText: {
    color: '#213127',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  smallDangerButton: {
    backgroundColor: '#fff0ed',
    borderColor: '#e0b1a8',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallDangerButtonText: {
    color: '#a63a2b',
    fontSize: 12,
    fontWeight: '800',
  },
  photoRepeaterItem: {
    gap: 10,
    marginBottom: 14,
  },
  repeaterRowCard: {
    backgroundColor: '#fbf7ef',
    borderColor: '#e3d6c5',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
    padding: 12,
  },
  repeaterRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  repeaterRowTitle: {
    color: '#213127',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  repeaterNestedBlock: {
    gap: 8,
  },
  repeaterFieldLabel: {
    color: '#37443c',
    fontSize: 13,
    fontWeight: '700',
  },
  matrixTable: {
    borderColor: '#e0d3c2',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  matrixRow: {
    flexDirection: 'row',
  },
  matrixCell: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#eadfce',
    borderBottomWidth: 1,
    borderRightColor: '#eadfce',
    borderRightWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    padding: 6,
    width: 78,
  },
  matrixLabelCell: {
    alignItems: 'flex-start',
    backgroundColor: '#fbf7ef',
    width: 118,
  },
  matrixHeaderCell: {
    backgroundColor: '#213127',
  },
  matrixHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  matrixRowLabel: {
    color: '#213127',
    fontSize: 13,
    fontWeight: '700',
  },
  matrixInput: {
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 10,
    borderWidth: 1,
    color: '#17261d',
    fontSize: 15,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: 'center',
    width: 58,
  },
  matrixTotalRow: {
    borderTopColor: '#d8ccbc',
    borderTopWidth: 1,
  },
  matrixTotalLabel: {
    color: '#213127',
    fontSize: 13,
    fontWeight: '800',
  },
  matrixTotalCell: {
    minHeight: 48,
  },
  matrixTotalOk: {
    backgroundColor: '#eef6ee',
  },
  matrixTotalInvalid: {
    backgroundColor: '#fff7dd',
  },
  matrixTotalText: {
    fontSize: 15,
    fontWeight: '800',
  },
  matrixTotalTextOk: {
    color: '#2d7a48',
  },
  matrixTotalTextInvalid: {
    color: '#8a5a00',
  },
  artSearchList: {
    backgroundColor: '#fffaf2',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    maxHeight: 280,
    overflow: 'hidden',
  },
  artSearchItem: {
    borderBottomColor: '#eadfce',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  artSearchName: {
    color: '#213127',
    fontSize: 14,
    fontWeight: '800',
  },
  artSearchMeta: {
    color: '#6f675c',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  artTableList: {
    gap: 10,
    marginTop: 12,
  },
  artTableRowCard: {
    backgroundColor: '#fbf7ef',
    borderColor: '#e3d6c5',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  artColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  artColumnInputGroup: {
    gap: 6,
    width: 104,
  },
  artValueInput: {
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 10,
    borderWidth: 1,
    color: '#17261d',
    fontSize: 14,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  presenceToggle: {
    alignItems: 'center',
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presenceCheckbox: {
    backgroundColor: '#ffffff',
    borderColor: '#6f675c',
    borderRadius: 4,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
  presenceCheckboxChecked: {
    backgroundColor: '#165d3c',
    borderColor: '#165d3c',
  },
  presenceToggleText: {
    color: '#213127',
    fontSize: 14,
    fontWeight: '800',
  },
  artCoordinateText: {
    color: '#6f675c',
    fontSize: 12,
    lineHeight: 17,
  },
  qrCard: {
    alignItems: 'center',
    backgroundColor: '#fbf7ef',
    borderColor: '#e3d6c5',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  qrTitle: {
    color: '#213127',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  qrHelp: {
    color: '#6f675c',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 24, 20, 0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fffaf2',
    borderRadius: 20,
    padding: 20,
    width: '100%',
  },
  dialogOptionList: {
    gap: 10,
    marginBottom: 8,
  },
  dialogOption: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dialogOptionSelected: {
    backgroundColor: '#eef6ee',
    borderColor: '#3f7d63',
  },
  dialogRadio: {
    borderColor: '#6f675c',
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    width: 22,
  },
  dialogRadioSelected: {
    backgroundColor: '#165d3c',
    borderColor: '#165d3c',
  },
  dialogOptionText: {
    color: '#213127',
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  dialogOptionTextSelected: {
    color: '#165d3c',
  },
  menuModalCard: {
    backgroundColor: '#fffaf2',
    borderRadius: 20,
    maxHeight: '82%',
    padding: 20,
    width: '100%',
  },
  menuHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#14231a',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  menuTitle: {
    marginBottom: 0,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f1ebe1',
    borderColor: '#ddd0c0',
    borderRadius: 16,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  closeButtonText: {
    color: '#213127',
    fontSize: 15,
    fontWeight: '800',
  },
  modalLine: {
    color: '#37443c',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },
  modalActions: {
    gap: 12,
    marginTop: 18,
  },
  menuList: {
    gap: 8,
  },
  menuSectionTitle: {
    color: '#6f675c',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  menuItem: {
    backgroundColor: '#f1ebe1',
    borderColor: '#ddd0c0',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemSelected: {
    backgroundColor: '#213127',
    borderColor: '#213127',
  },
  menuItemDisabled: {
    opacity: 0.55,
  },
  menuItemText: {
    color: '#24352a',
    fontSize: 16,
    fontWeight: '700',
  },
  menuItemTextSelected: {
    color: '#ffffff',
  },
  modalFieldLabel: {
    marginTop: 16,
  },
  mapScreen: {
    backgroundColor: '#f4efe7',
    flex: 1,
  },
  mapHeader: {
    alignItems: 'center',
    backgroundColor: '#fffaf2',
    borderBottomColor: '#ddd0c0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  mapContent: {
    padding: 16,
    paddingBottom: 32,
  },
  fullMapContent: {
    flex: 1,
    padding: 16,
  },
  mapCanvasWrap: {
    backgroundColor: '#eef3ed',
    borderColor: '#cdd9cd',
    borderRadius: 18,
    borderWidth: 1,
    height: 430,
    overflow: 'hidden',
    width: '100%',
  },
  transectMap: {
    flex: 1,
  },
  plotSelectionMapWrap: {
    backgroundColor: '#eef3ed',
    borderColor: '#cdd9cd',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    overflow: 'hidden',
  },
  mapMetaGrid: {
    backgroundColor: '#fffaf2',
    borderColor: '#ddd0c0',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    padding: 14,
  },
  mapEmptyState: {
    backgroundColor: '#fffaf2',
    borderColor: '#ddd0c0',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  inventoryListContent: {
    gap: 10,
    padding: 16,
    paddingBottom: 32,
  },
  inventoryListItem: {
    alignItems: 'center',
    backgroundColor: '#fffaf2',
    borderColor: '#ddd0c0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  inventoryListTitle: {
    color: '#213127',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  inventoryListMeta: {
    color: '#6f675c',
    fontSize: 12,
    lineHeight: 17,
  },
  cameraScreen: {
    backgroundColor: '#f4efe7',
    flex: 1,
    padding: 16,
  },
  cameraHeader: {
    marginBottom: 12,
  },
  cameraCard: {
    backgroundColor: '#1b211d',
    borderRadius: 20,
    flex: 1,
    overflow: 'hidden',
  },
  photoCamera: {
    flex: 1,
  },
  cameraActions: {
    gap: 12,
    paddingTop: 14,
  },
  scannerScreen: {
    backgroundColor: '#f4efe7',
    flex: 1,
    padding: 16,
  },
  scannerHeader: {
    marginBottom: 16,
  },
  scannerCard: {
    backgroundColor: '#1b211d',
    borderRadius: 20,
    flex: 1,
    overflow: 'hidden',
  },
  scannerCamera: {
    flex: 1,
  },
});

export default StrandApp;
