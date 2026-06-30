import 'react-native-get-random-values';

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
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
import QRCode from 'react-native-qrcode-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {WebView, type WebViewMessageEvent} from 'react-native-webview';
import {v4 as uuidv4} from 'uuid';
import {AppHeader} from './components/AppHeader';
import {useGpsStatus} from './hooks/useGpsStatus';
import {initializeApplication, runManualBasicDataUpdate} from './services/bootstrapService';
import {
  ArtResourceRow,
  DatasetMap,
  DatasetRow,
  filterDatasetRows,
  findDatasetRow,
  getUniqueDatasetOptions,
  loadConfiguredArtResources,
  loadConfiguredDatasets,
  loadOldInventoryData,
  OldInventoryDataRow,
} from './services/datasetService';
import {
  deleteFileIfExists,
  loadWorkingDraft,
  saveCapturedPhotoToPublicStorage,
  saveWorkingDraft,
} from './services/publicFileService';
import {createDraftExportFileInfo, createDraftExportPayload, exportDraftToJson} from './services/exportService';
import {listServerMessagesFromSftp, uploadExportAndPhotosToSftp} from './services/sftpBundleService';
import {
  InventoryListItem,
  deleteInventoryFromDevice,
  getInventoryIdFromDraft,
  loadInventoryDraftSnapshot,
  loadInventoryIndex,
  markInventorySubmitted,
  saveInventoryDraftSnapshot,
} from './services/inventoryStore';
import {createPlotFileBase, getInventerareFileId} from './services/namingService';
import {BasicDataConfig, BasicDataField, BasicDataListOption, GpsSnapshot} from './types/basicData';

const SESSION_CODE_TYPE = 'strand-session';
const USER_SETUP_FIELD_IDS = new Set(['lagnummer', 'inventerare']);
const REQUIRES_SELECTED_PLOT_FIELD_IDS = new Set(['inventeringstyp']);
const HEADER_MENU_TAB_IDS = new Set([
  'arter',
  'ej_inventerad',
  'extra_bilder',
]);
const NORMAL_INVENTORY_TAB_ID = 'start_bilder';
const DISTANCE_INVENTORY_TAB_ID = 'hydro';
const SIDE_TAB_LAST_IDS = new Set(['substrat']);
const MESSAGE_READ_KEYS_STORAGE_KEY = '@strand/read-server-message-keys';
const MESSAGE_POLL_INTERVAL_MS = 15 * 60 * 1000;
const BLALAPP_TEXT_FIELD_ID = 'blalapp';
const BLALAPP_PHOTO_FIELD_ID = 'blalapp_foto';
const BLALAPP_MAX_LENGTH = 500;

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
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  accuracy?: number;
  kommentar?: string;
  tag?: string;
}

interface PhotoCaptureTarget {
  fieldId: string;
  mode: 'single' | 'set' | 'repeater' | 'rowPhotoArray' | 'artObservationPhoto' | 'nestedArtObservationPhoto';
  category: string;
  label: string;
  typeValue?: string;
  typeLabel?: string;
  rowId?: string;
  nestedFieldId?: string;
  observationId?: string;
  parentRowId?: string;
  replaceExisting?: boolean;
}

interface ServerMessage {
  key: string;
  fileName: string;
  modifiedAt: number;
  size: number;
  text: string;
  read: boolean;
}

type RepeaterRow = Record<string, unknown> & {id: string};
type ArtLists = Record<string, ArtResourceRow[]>;
type OldInventoryDataMap = Record<string, OldInventoryDataRow>;
type ArtTableRow = Record<string, unknown> & {id: string; artId: string};
type TransectMapLayer = 'topo' | 'orto';
type EditingFieldState = {
  field: BasicDataField;
  value: string;
};

interface MapPoint {
  x: number;
  y: number;
}

interface TransectZone {
  id: string;
  label: string;
  startMeters: number;
  endMeters: number;
  color: string;
}

interface NearestPlotMatch {
  row: Record<string, string>;
  distanceMeters: number;
}

interface StoredGpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  accuracy?: number;
  timestamp: number;
}

interface CompactGpsPoint {
  lat?: number;
  lon?: number;
  alt?: number | null;
  altAcc?: number | null;
  acc?: number;
  t?: number;
}

interface SessionQrPayload {
  type: string;
  v?: number;
  uuid?: string;
  ruta?: string;
  provyta?: string;
  lagnummer?: string;
  startpunkt?: CompactGpsPoint | StoredGpsPoint;
  slutpunkt?: CompactGpsPoint | StoredGpsPoint;
}

interface ParsedSessionCode {
  uuid: string;
  ruta?: string;
  provyta?: string;
  lagnummer?: string;
  startpunkt?: StoredGpsPoint;
  slutpunkt?: StoredGpsPoint;
}

function isValidUuid(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function compactGpsPoint(value: unknown): CompactGpsPoint | undefined {
  if (!isStoredGpsPoint(value)) {
    return undefined;
  }

  return {
    lat: Number(value.latitude.toFixed(8)),
    lon: Number(value.longitude.toFixed(8)),
    alt: typeof value.altitude === 'number' ? Number(value.altitude.toFixed(3)) : null,
    altAcc: typeof value.altitudeAccuracy === 'number' ? Number(value.altitudeAccuracy.toFixed(3)) : null,
    acc: typeof value.accuracy === 'number' ? Number(value.accuracy.toFixed(3)) : undefined,
    t: value.timestamp,
  };
}

function parseQrGpsPoint(value: unknown): StoredGpsPoint | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if (isStoredGpsPoint(value)) {
    return value;
  }

  const point = value as CompactGpsPoint;
  if (typeof point.lat !== 'number' || typeof point.lon !== 'number') {
    return undefined;
  }

  return {
    latitude: point.lat,
    longitude: point.lon,
    altitude: typeof point.alt === 'number' ? point.alt : null,
    altitudeAccuracy: typeof point.altAcc === 'number' ? point.altAcc : null,
    accuracy: typeof point.acc === 'number' ? point.acc : undefined,
    timestamp: typeof point.t === 'number' ? point.t : Date.now(),
  };
}

function createSessionQrPayload(sessionUuid: string, draft: Record<string, unknown>) {
  const payload: SessionQrPayload = {
    type: SESSION_CODE_TYPE,
    v: 2,
    uuid: sessionUuid,
    ruta: typeof draft.ruta === 'string' ? draft.ruta : undefined,
    provyta: typeof draft.provyta === 'string' ? draft.provyta : undefined,
    lagnummer: typeof draft.lagnummer === 'string' ? draft.lagnummer : undefined,
    startpunkt: compactGpsPoint(draft.startpunkt),
    slutpunkt: compactGpsPoint(draft.slutpunkt),
  };

  return JSON.stringify(payload);
}

function parseSessionCode(rawValue: string): ParsedSessionCode | null {
  const trimmed = rawValue.trim();

  if (isValidUuid(trimmed)) {
    return {uuid: trimmed};
  }

  try {
    const parsed = JSON.parse(trimmed) as SessionQrPayload;
    if (parsed.type === SESSION_CODE_TYPE && isValidUuid(parsed.uuid)) {
      return {
        uuid: parsed.uuid,
        ruta: typeof parsed.ruta === 'string' ? parsed.ruta : undefined,
        provyta: typeof parsed.provyta === 'string' ? parsed.provyta : undefined,
        lagnummer: typeof parsed.lagnummer === 'string' ? parsed.lagnummer : undefined,
        startpunkt: parseQrGpsPoint(parsed.startpunkt),
        slutpunkt: parseQrGpsPoint(parsed.slutpunkt),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function createTransectLeafletHtml(options: {
  startCoordinate: {latitude: number; longitude: number} | null;
  endCoordinate: {latitude: number; longitude: number} | null;
  referenceStartCoordinate?: {latitude: number; longitude: number} | null;
  referenceEndCoordinate?: {latitude: number; longitude: number} | null;
  userCoordinate: {latitude: number; longitude: number} | null;
  zones: TransectZone[];
  preliminaryZone: TransectZone | null;
  forceDetail?: boolean;
  fitPadding?: number;
  fitMaxZoom?: number;
  includeUserInBounds?: boolean;
  initialLayer: TransectMapLayer;
  ruta: string;
  provyta: string;
}) {
  const data = JSON.stringify(options);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    body { background: #eef3ed; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #map { touch-action: none; }
    .leaflet-control-attribution { font-size: 10px; }
    .layer-switch {
      background: #fffaf2;
      border: 1px solid #c9beb0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      display: flex;
      gap: 4px;
      padding: 4px;
    }
    .layer-switch button {
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: #24352a;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 10px;
    }
    .layer-switch button.active {
      background: #213127;
      color: #ffffff;
    }
    .transect-zoom-control button {
      background: #fffaf2;
      border: 1px solid #c9beb0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      color: #24352a;
      font-size: 13px;
      font-weight: 800;
      padding: 8px 10px;
    }
    .marker-dot {
      align-items: center;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 5px rgba(0,0,0,0.35);
      display: flex;
      height: 16px;
      justify-content: center;
      width: 16px;
    }
    .marker-start, .marker-end { background: #2d7a48; }
    .marker-user { background: #a63a2b; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const data = ${data};
    const hasTransect = Boolean(data.startCoordinate && data.endCoordinate);
    const hasReferenceTransect = Boolean(data.referenceStartCoordinate && data.referenceEndCoordinate);
    const start = hasTransect ? [data.startCoordinate.latitude, data.startCoordinate.longitude] : null;
    const end = hasTransect ? [data.endCoordinate.latitude, data.endCoordinate.longitude] : null;
    const referenceStart = hasReferenceTransect ? [data.referenceStartCoordinate.latitude, data.referenceStartCoordinate.longitude] : null;
    const referenceEnd = hasReferenceTransect ? [data.referenceEndCoordinate.latitude, data.referenceEndCoordinate.longitude] : null;
    const user = data.userCoordinate ? [data.userCoordinate.latitude, data.userCoordinate.longitude] : null;
    const zones = Array.isArray(data.zones) ? data.zones : [];
    const preliminaryZone = data.preliminaryZone || null;
    const forceDetail = data.forceDetail === true;
    const fitPadding = Number.isFinite(data.fitPadding) ? data.fitPadding : 0.5;
    const fitMaxZoom = Number.isFinite(data.fitMaxZoom) ? data.fitMaxZoom : 18;
    const includeUserInBounds = data.includeUserInBounds !== false;
    const initialLayer = data.initialLayer === 'orto' ? 'orto' : 'topo';
    const transectWidthMeters = 10;
    const detailZoomThreshold = 17;

    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      maxNativeZoom: 17,
      attribution: 'Kartdata © OpenStreetMap, SRTM | Kartstil © OpenTopoMap'
    });
    const orto = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 19,
      attribution: 'Tiles © Esri'
    });

    const map = L.map('map', {
      layers: [initialLayer === 'orto' ? orto : topo],
      zoomControl: true,
      attributionControl: true,
      tap: true
    });

    function toLocalMeters(origin, coordinate) {
      const metersPerDegreeLat = 111320;
      const metersPerDegreeLon = 111320 * Math.cos(origin[0] * Math.PI / 180);
      return {
        x: (coordinate[1] - origin[1]) * metersPerDegreeLon,
        y: (coordinate[0] - origin[0]) * metersPerDegreeLat
      };
    }

    function toLatLng(origin, point) {
      const metersPerDegreeLat = 111320;
      const metersPerDegreeLon = 111320 * Math.cos(origin[0] * Math.PI / 180);
      return [
        origin[0] + point.y / metersPerDegreeLat,
        origin[1] + point.x / metersPerDegreeLon
      ];
    }

    function buildTransectBox() {
      return buildTransectSection(0, null);
    }

    function buildSectionFor(segmentStart, segmentEnd, startMeters, endMeters) {
      const endLocal = toLocalMeters(segmentStart, segmentEnd);
      const length = Math.hypot(endLocal.x, endLocal.y) || 1;
      const from = Math.max(0, Math.min(length, Number(startMeters) || 0));
      const to = Math.max(from, Math.min(length, endMeters == null ? length : Number(endMeters) || 0));
      const unit = {
        x: endLocal.x / length,
        y: endLocal.y / length
      };
      const normal = {
        x: -(endLocal.y / length) * (transectWidthMeters / 2),
        y: (endLocal.x / length) * (transectWidthMeters / 2)
      };
      const sectionStart = {x: unit.x * from, y: unit.y * from};
      const sectionEnd = {x: unit.x * to, y: unit.y * to};
      const startLeft = {x: sectionStart.x + normal.x, y: sectionStart.y + normal.y};
      const startRight = {x: sectionStart.x - normal.x, y: sectionStart.y - normal.y};
      const endLeft = {x: sectionEnd.x + normal.x, y: sectionEnd.y + normal.y};
      const endRight = {x: sectionEnd.x - normal.x, y: sectionEnd.y - normal.y};
      return [
        toLatLng(segmentStart, startLeft),
        toLatLng(segmentStart, endLeft),
        toLatLng(segmentStart, endRight),
        toLatLng(segmentStart, startRight)
      ];
    }

    function buildTransectSection(startMeters, endMeters) {
      return buildSectionFor(start, end, startMeters, endMeters);
    }

    const referenceBoxCoordinates = hasReferenceTransect ? buildSectionFor(referenceStart, referenceEnd, 0, null) : [];
    const referenceBox = hasReferenceTransect
      ? L.polygon(referenceBoxCoordinates, {
        color: 'rgba(43,125,201,0.2)',
        dashArray: '7 6',
        fillColor: '#56a8f5',
        fillOpacity: 0.2,
        opacity: 0.2,
        weight: 2
      }).addTo(map).bindPopup('Teoretisk transekt från provyteunderlag')
      : null;
    const referenceCenterline = hasReferenceTransect
      ? L.polyline([referenceStart, referenceEnd], {
        color: '#2b7dc9',
        dashArray: '6 6',
        opacity: 0.35,
        weight: 2
      }).addTo(map).bindPopup('Teoretisk centrumlinje')
      : null;
    const transectBoxCoordinates = hasTransect ? buildTransectBox() : [];
    const transectBox = hasTransect ? L.polygon(transectBoxCoordinates, {
      color: '#b88700',
      fillColor: '#ffd84d',
      fillOpacity: zones.length ? 0.08 : 0.28,
      opacity: 0.95,
      weight: 2
    }).bindPopup('Uppmätt transekt, 10 m bred') : null;
    const transectCenterline = hasTransect ? L.polyline([start, end], {
      color: '#18231b',
      opacity: 0.85,
      weight: 2
    }).bindPopup('Uppmätt centrumlinje') : null;
    const zoneLayers = hasTransect ? zones
      .filter(zone => Number.isFinite(zone.startMeters) && Number.isFinite(zone.endMeters) && zone.endMeters > zone.startMeters)
      .map(zone => L.polygon(buildTransectSection(zone.startMeters, zone.endMeters), {
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: 0.3,
        opacity: 0.9,
        weight: 1
      }).bindPopup(zone.label + ': ' + zone.startMeters.toFixed(1) + '-' + zone.endMeters.toFixed(1) + ' m')) : [];
    const preliminaryZoneLayer = hasTransect && preliminaryZone && Number.isFinite(preliminaryZone.startMeters) && Number.isFinite(preliminaryZone.endMeters) && preliminaryZone.endMeters > preliminaryZone.startMeters
      ? L.polygon(buildTransectSection(preliminaryZone.startMeters, preliminaryZone.endMeters), {
        color: preliminaryZone.color,
        dashArray: '6 4',
        fillColor: preliminaryZone.color,
        fillOpacity: 0.18,
        opacity: 0.95,
        weight: 2
      }).bindPopup(preliminaryZone.label + ' preliminär')
      : null;
    const overviewIcon = L.divIcon({className: '', html: '<div class="marker-dot marker-start"></div>', iconSize: [20, 20], iconAnchor: [10, 10]});
    const userIcon = L.divIcon({className: '', html: '<div class="marker-dot marker-user"></div>', iconSize: [20, 20], iconAnchor: [10, 10]});
    const center = hasTransect ? [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2
    ] : null;
    const overviewMarker = center ? L.marker(center, {icon: overviewIcon}).bindPopup('Uppmätt transekt') : null;

    if (user) {
      L.marker(user, {icon: userIcon}).addTo(map).bindPopup('Din GPS-position');
    }

    function updateTransectVisibility() {
      const showDetail = forceDetail || map.getZoom() >= detailZoomThreshold;
      if (showDetail) {
        if (overviewMarker && map.hasLayer(overviewMarker)) map.removeLayer(overviewMarker);
        if (transectBox && !map.hasLayer(transectBox)) transectBox.addTo(map);
        if (transectCenterline && !map.hasLayer(transectCenterline)) transectCenterline.addTo(map);
        zoneLayers.forEach(layer => {
          if (!map.hasLayer(layer)) layer.addTo(map);
        });
        if (preliminaryZoneLayer && !map.hasLayer(preliminaryZoneLayer)) preliminaryZoneLayer.addTo(map);
        if (transectCenterline) transectCenterline.bringToFront();
      } else {
        zoneLayers.forEach(layer => {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        });
        if (preliminaryZoneLayer && map.hasLayer(preliminaryZoneLayer)) map.removeLayer(preliminaryZoneLayer);
        if (transectCenterline && map.hasLayer(transectCenterline)) map.removeLayer(transectCenterline);
        if (transectBox && map.hasLayer(transectBox)) map.removeLayer(transectBox);
        if (overviewMarker && !map.hasLayer(overviewMarker)) overviewMarker.addTo(map);
      }
    }

    const transectBounds = L.latLngBounds(transectBoxCoordinates.length ? transectBoxCoordinates : referenceBoxCoordinates);
    const bounds = L.latLngBounds([...referenceBoxCoordinates, ...transectBoxCoordinates]);
    if (user && includeUserInBounds) {
      bounds.extend(user);
    }

    function zoomToTransect() {
      map.fitBounds(transectBounds.pad(fitPadding), {maxZoom: fitMaxZoom});
    }

    map.fitBounds(bounds.pad(fitPadding), {maxZoom: fitMaxZoom});
    updateTransectVisibility();
    map.on('zoomend', updateTransectVisibility);

    const zoomControl = L.control({position: 'topleft'});
    zoomControl.onAdd = function () {
      const container = L.DomUtil.create('div', 'transect-zoom-control');
      const button = L.DomUtil.create('button', '', container);
      button.type = 'button';
      button.textContent = 'Transekt';
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.on(button, 'click', zoomToTransect);
      return container;
    };
    zoomControl.addTo(map);

    const switchControl = L.control({position: 'topright'});
    switchControl.onAdd = function () {
      const container = L.DomUtil.create('div', 'layer-switch');
      const topoButton = L.DomUtil.create('button', 'active', container);
      const ortoButton = L.DomUtil.create('button', '', container);
      topoButton.type = 'button';
      ortoButton.type = 'button';
      topoButton.textContent = 'Topo';
      ortoButton.textContent = 'Orto';

      function notifyLayer(layerName) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'layer', layer: layerName}));
        }
      }

      function setLayer(layerName, notify) {
        if (layerName === 'topo') {
          if (map.hasLayer(orto)) map.removeLayer(orto);
          if (!map.hasLayer(topo)) map.addLayer(topo);
          topoButton.classList.add('active');
          ortoButton.classList.remove('active');
        } else {
          if (map.hasLayer(topo)) map.removeLayer(topo);
          if (!map.hasLayer(orto)) map.addLayer(orto);
          ortoButton.classList.add('active');
          topoButton.classList.remove('active');
        }
        if (notify) {
          notifyLayer(layerName);
        }
      }

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      L.DomEvent.on(topoButton, 'click', () => setLayer('topo', true));
      L.DomEvent.on(ortoButton, 'click', () => setLayer('orto', true));
      setLayer(initialLayer, false);
      return container;
    };
    switchControl.addTo(map);
  </script>
</body>
</html>`;
}

function createPlotSelectionLeafletHtml(options: {
  points: Array<{
    latitude: number;
    longitude: number;
    title: string;
    selected: boolean;
    row: Record<string, string>;
  }>;
  userCoordinate: {latitude: number; longitude: number} | null;
}) {
  const data = JSON.stringify(options);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    body { background: #eef3ed; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #map { touch-action: none; }
    .leaflet-control-attribution { font-size: 10px; }
    .plot-marker {
      align-items: center;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 5px rgba(0,0,0,0.35);
      display: flex;
      height: 18px;
      justify-content: center;
      width: 18px;
    }
    .plot-marker.default { background: #277a48; }
    .plot-marker.selected { background: #245fc7; height: 22px; width: 22px; }
    .plot-marker.user { background: #b33a2f; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const data = ${data};
    const points = Array.isArray(data.points) ? data.points : [];
    const user = data.userCoordinate;
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      maxNativeZoom: 17,
      attribution: 'Kartdata © OpenStreetMap, SRTM | Kartstil © OpenTopoMap'
    });
    const map = L.map('map', {
      layers: [topo],
      zoomControl: true,
      attributionControl: true,
      tap: true
    });

    function icon(className, size) {
      return L.divIcon({
        className: '',
        html: '<div class="plot-marker ' + className + '"></div>',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
    }

    const bounds = L.latLngBounds([]);
    points.forEach(point => {
      const coordinate = [point.latitude, point.longitude];
      bounds.extend(coordinate);
      const marker = L.marker(coordinate, {
        icon: icon(point.selected ? 'selected' : 'default', point.selected ? 22 : 18),
        title: point.title || ''
      }).addTo(map);
      marker.bindPopup(point.title || 'Provyta');
      marker.on('click', () => {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'plot', row: point.row}));
        }
      });
    });

    if (user && Number.isFinite(user.latitude) && Number.isFinite(user.longitude)) {
      const coordinate = [user.latitude, user.longitude];
      bounds.extend(coordinate);
      L.marker(coordinate, {icon: icon('user', 18), title: 'Din GPS-position'}).addTo(map).bindPopup('Din GPS-position');
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.1), {maxZoom: 15});
    } else {
      map.setView([59.5, 18], 8);
    }
  </script>
</body>
</html>`;
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

function isStoredGpsPoint(value: unknown): value is StoredGpsPoint {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as StoredGpsPoint).latitude === 'number' &&
      typeof (value as StoredGpsPoint).longitude === 'number' &&
      typeof (value as StoredGpsPoint).timestamp === 'number',
  );
}

function formatGpsPoint(value: unknown) {
  if (!isStoredGpsPoint(value)) {
    return 'Ej satt';
  }

  const time = new Date(value.timestamp).toLocaleTimeString('sv-SE', {hour: '2-digit', minute: '2-digit'});
  const accuracy = typeof value.accuracy === 'number' ? `, ±${value.accuracy.toFixed(0)} m` : '';
  const altitude = typeof value.altitude === 'number' ? `, höjd ${value.altitude.toFixed(2)} m` : '';
  return `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}${altitude} (${time}${accuracy})`;
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

function getStringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function getItemSchemaFields(field: BasicDataField) {
  const schema = field.item_schema;
  if (!schema || typeof schema !== 'object' || !('fields' in schema) || !Array.isArray(schema.fields)) {
    return [];
  }

  const fields = schema.fields.filter((item): item is BasicDataField => Boolean(item && typeof item === 'object'));
  if (field.id !== 'deponi_rows') {
    return fields;
  }

  return fields.map(item =>
    item.id === 'kategori'
      ? {
          ...item,
          type: 'select',
          readonly: false,
          list_id: 'deponi_kategorier',
          presentation: 'listbox',
        }
      : item,
  );
}

function getListOptionValue(option: BasicDataListOption) {
  return option.value ?? option.id ?? option.label;
}

function getListOptionLabel(options: BasicDataListOption[], value: unknown) {
  const rawValue = String(value ?? '');
  const option = options.find(item => getListOptionValue(item) === rawValue || item.label === rawValue);
  return option?.label ?? rawValue;
}

function normalizeDeponiRows(rows: RepeaterRow[], options: BasicDataListOption[]) {
  return rows
    .filter(row => {
      const category = String(row.kategori ?? '');
      const isLegacyFixedRow = options.some(option => option.label === category);
      const hasAmount = String(row.varde ?? '').trim().length > 0;
      const hasPhotos = getPhotoArray(row.foton).length > 0;
      return !isLegacyFixedRow || hasAmount || hasPhotos;
    })
    .map(row => {
      const category = String(row.kategori ?? '');
      const option = options.find(item => item.label === category);
      return option ? {...row, kategori: getListOptionValue(option)} : row;
    });
}

function getStringArrayProperty(field: BasicDataField, key: string) {
  const value = field[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getStringProperty(field: BasicDataField, key: string) {
  const value = field[key];
  return typeof value === 'string' ? value : '';
}

function formatDatasetSearchLabel(row: DatasetRow, valueKey: string, displayKey: string) {
  const value = row[valueKey] ?? '';
  const label = row[displayKey] ?? '';

  if (value && label) {
    return `${value} - ${label}`;
  }

  return value || label;
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

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
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

function getBearingDegreesFromPoint(point: MapPoint) {
  const degrees = (Math.atan2(point.x, point.y) * 180) / Math.PI;
  return (degrees + 360) % 360;
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

function getDistanceAlongSegmentMeters(point: MapPoint, start: MapPoint, end: MapPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return 0;
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.sqrt(lengthSquared) * t;
}

function isZoneBoundaryField(field: BasicDataField) {
  return field.special === 'transect_zone_boundary';
}

function isHabitatTransectRowsField(field: BasicDataField | null | undefined) {
  return field?.special === 'habitat_transect_rows';
}

function isFordynHabitatRowsField(field: BasicDataField | null | undefined) {
  return field?.special === 'fordyn_habitat_rows';
}

function isTransectDistanceField(field: BasicDataField | null | undefined) {
  return field?.special === 'transect_distance';
}

function getZoneBoundaryOrder(field: BasicDataField) {
  const order = parseNumber(field.zone_order);
  return order ?? Number.MAX_SAFE_INTEGER;
}

function getZoneBoundaryColor(field: BasicDataField) {
  return typeof field.zone_color === 'string' ? field.zone_color : '#ffd84d';
}

function StrandApp() {
  const insets = useSafeAreaInsets();
  const {gps, refreshGps} = useGpsStatus();
  const [basicData, setBasicData] = useState<BasicDataConfig | null>(null);
  const [datasets, setDatasets] = useState<DatasetMap>({});
  const [artLists, setArtLists] = useState<ArtLists>({});
  const [oldInventoryData, setOldInventoryData] = useState<OldInventoryDataMap>({});
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showGpsModal, setShowGpsModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showPlotMapModal, setShowPlotMapModal] = useState(false);
  const [showInventoryListModal, setShowInventoryListModal] = useState(false);
  const [showExportPreviewModal, setShowExportPreviewModal] = useState(false);
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showNavigationMenu, setShowNavigationMenu] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showBlalappModal, setShowBlalappModal] = useState(false);
  const [inventories, setInventories] = useState<InventoryListItem[]>([]);
  const [deleteInventoryTarget, setDeleteInventoryTarget] = useState<InventoryListItem | null>(null);
  const [deleteInventoryInput, setDeleteInventoryInput] = useState('');
  const [editingField, setEditingField] = useState<EditingFieldState | null>(null);
  const [photoCaptureTarget, setPhotoCaptureTarget] = useState<PhotoCaptureTarget | null>(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [openDatasetFieldId, setOpenDatasetFieldId] = useState<string | null>(null);
  const [openRepeaterDatasetKey, setOpenRepeaterDatasetKey] = useState<string | null>(null);
  const [repeaterDatasetSearch, setRepeaterDatasetSearch] = useState<Record<string, string>>({});
  const [artSearchByField, setArtSearchByField] = useState<Record<string, string>>({});
  const [manualUuidInput, setManualUuidInput] = useState('');
  const [lagnummerInput, setLagnummerInput] = useState('');
  const [inventerareInput, setInventerareInput] = useState('');
  const [blalappInput, setBlalappInput] = useState('');
  const transectMapLayerRef = useRef<TransectMapLayer>('topo');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Förbereder appen...');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [serverMessages, setServerMessages] = useState<ServerMessage[]>([]);
  const [readServerMessageKeys, setReadServerMessageKeys] = useState<Set<string>>(() => new Set());
  const [serverMessageReadKeysLoaded, setServerMessageReadKeysLoaded] = useState(false);
  const photoCameraRef = useRef<CameraApi | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptShown = useRef(false);
  const announcedMessageKeys = useRef(new Set<string>());

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

  const zoneBoundaryFields = useMemo(() => {
    const fields: BasicDataField[] = [];
    basicData?.tabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.fields.forEach(fieldOrId => {
          const field = resolveFieldFromMap(fieldOrId, globalFieldMap);
          if (field && isZoneBoundaryField(field)) {
            fields.push(field);
          }
        });
      });
    });

    return fields.sort((left, right) => getZoneBoundaryOrder(left) - getZoneBoundaryOrder(right));
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

  const currentPyid = getStringValue(draft.pyid) || getStringValue(selectedPlotRow?.pyid);
  const currentOldInventoryData = currentPyid ? oldInventoryData[currentPyid] ?? null : null;

  const currentExportPreview = useMemo(() => {
    if (!basicData) {
      return null;
    }

    const fileInfo = createDraftExportFileInfo(draft);
    const payload = createDraftExportPayload({basicData, draft});
    return {
      ...fileInfo,
      json: JSON.stringify(payload, null, 2),
    };
  }, [basicData, draft]);

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

  const transectDistanceMeters = (() => {
    const geometry = getReferenceTransectGeometry();
    if (!geometry || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return null;
    }

    const userPoint = latLonToRelativeMeters(geometry.startLat, geometry.startLon, gps.latitude, gps.longitude);
    return getDistanceToSegmentMeters(userPoint, geometry.start, geometry.end);
  })();

  function getTransectGeometry() {
    const storedStart = isStoredGpsPoint(draft.startpunkt) ? draft.startpunkt : null;
    const storedEnd = isStoredGpsPoint(draft.slutpunkt) ? draft.slutpunkt : null;

    if (
      storedStart &&
      storedEnd &&
      isValidCoordinate(storedStart.latitude, storedStart.longitude) &&
      isValidCoordinate(storedEnd.latitude, storedEnd.longitude)
    ) {
      const end = latLonToRelativeMeters(
        storedStart.latitude,
        storedStart.longitude,
        storedEnd.latitude,
        storedEnd.longitude,
      );
      const lengthMeters = Math.hypot(end.x, end.y);
      const bearingDegrees = getBearingDegreesFromPoint(end);

      return {
        startLat: storedStart.latitude,
        startLon: storedStart.longitude,
        lengthMeters,
        bearingDegrees,
        start: {x: 0, y: 0},
        end,
        startCoordinate: {latitude: storedStart.latitude, longitude: storedStart.longitude},
        endCoordinate: {latitude: storedEnd.latitude, longitude: storedEnd.longitude},
      };
    }

    return null;
  }

  function getReferenceTransectGeometry() {
    const startLat = parseNumber(selectedPlotRow?.latitud);
    const startLon = parseNumber(selectedPlotRow?.longitud);
    const lengthMeters = parseNumber(selectedPlotRow?.transektlen);
    const bearingDegrees = parseNumber(selectedPlotRow?.transektriktning);

    if (
      !selectedPlotRow ||
      startLat == null ||
      startLon == null ||
      lengthMeters == null ||
      bearingDegrees == null ||
      !isValidCoordinate(startLat, startLon)
    ) {
      return null;
    }

    const start: MapPoint = {x: 0, y: 0};
    const end = getTransectEndPoint(lengthMeters, bearingDegrees);

    return {
      startLat,
      startLon,
      lengthMeters,
      bearingDegrees,
      start,
      end,
      startCoordinate: relativeMetersToLatLon(startLat, startLon, start),
      endCoordinate: relativeMetersToLatLon(startLat, startLon, end),
    };
  }

  function getTransectLengthMeters() {
    return getTransectGeometry()?.lengthMeters ?? null;
  }

  function formatMetersValue(value: number | null) {
    if (value == null || !Number.isFinite(value)) {
      return '';
    }

    return value < 1 ? value.toFixed(1) : String(Math.round(value));
  }

  function getHabitatRowStart(rows: RepeaterRow[], index: number) {
    if (index <= 0) {
      return 0;
    }

    return parseNumber(rows[index - 1]?.slut) ?? 0;
  }

  function normalizeHabitatCodeAliases(row: RepeaterRow): RepeaterRow {
    const code = getStringValue(row.kod) || getStringValue(row.habitat);
    const name = getStringValue(row.namn) || getStringValue(row.habitatnamn);

    if (!code && !name) {
      return row;
    }

    return {
      ...row,
      kod: getStringValue(row.kod) || code,
      namn: getStringValue(row.namn) || name,
      habitat: getStringValue(row.habitat) || code,
      habitatnamn: getStringValue(row.habitatnamn) || name,
    };
  }

  function normalizeHabitatRows(rows: RepeaterRow[]): RepeaterRow[] {
    return rows.map((row, index) => ({
      ...normalizeHabitatCodeAliases(row),
      start: formatMetersValue(getHabitatRowStart(rows, index)),
    }));
  }

  function getFordynHabitatBounds() {
    const habitatRows = normalizeHabitatRows(getRepeaterRows(draft.habitat_rows));
    const habitatRow = habitatRows.find(row => getStringValue(row.kod).trim() === '2100');
    if (!habitatRow) {
      return null;
    }

    const startMeters = parseNumber(habitatRow.start);
    const endMeters = parseNumber(habitatRow.slut);
    if (startMeters == null || endMeters == null || endMeters <= startMeters) {
      return null;
    }

    return {startMeters, endMeters, habitatRow};
  }

  function getFordynHabitatRowStart(rows: RepeaterRow[], index: number, bounds = getFordynHabitatBounds()) {
    if (!bounds) {
      return null;
    }

    if (index <= 0) {
      return bounds.startMeters;
    }

    return parseNumber(rows[index - 1]?.slut) ?? bounds.startMeters;
  }

  function normalizeFordynHabitatRows(rows: RepeaterRow[]): RepeaterRow[] {
    const bounds = getFordynHabitatBounds();
    if (!bounds) {
      return [];
    }

    return rows.map((row, index) => {
      const startMeters = getFordynHabitatRowStart(rows, index, bounds) ?? bounds.startMeters;
      const isLastRow = index === rows.length - 1;
      const rowEnd = isLastRow ? bounds.endMeters : parseNumber(row.slut);
      return {
        ...normalizeHabitatCodeAliases(row),
        start: formatMetersValue(startMeters),
        slut: formatMetersValue(rowEnd == null ? bounds.endMeters : Math.min(Math.max(rowEnd, startMeters), bounds.endMeters)),
      };
    });
  }

  function normalizeRowsForField(field: BasicDataField | null | undefined, rows: RepeaterRow[]) {
    if (isHabitatTransectRowsField(field)) {
      return normalizeHabitatRows(rows);
    }

    if (isFordynHabitatRowsField(field)) {
      return normalizeFordynHabitatRows(rows);
    }

    return rows;
  }

  function getZoneBoundaryStartMeters(field: BasicDataField, values: Record<string, unknown> = draft) {
    const index = zoneBoundaryFields.findIndex(item => item.id === field.id);
    if (index <= 0) {
      return 0;
    }

    const previousValue = parseNumber(values[zoneBoundaryFields[index - 1].id]);
    return previousValue ?? 0;
  }

  function buildTransectZones(values: Record<string, unknown> = draft, editing?: {field: BasicDataField; value: string}) {
    let startMeters = 0;
    const zones: TransectZone[] = [];

    zoneBoundaryFields.forEach(field => {
      const rawEnd = editing?.field.id === field.id ? editing.value : values[field.id];
      const endMeters = parseNumber(rawEnd);
      if (endMeters != null && endMeters > startMeters) {
        zones.push({
          id: field.id,
          label: typeof field.zone_label === 'string' ? field.zone_label : field.label.replace(/\s*slutlängd$/i, ''),
          startMeters,
          endMeters,
          color: getZoneBoundaryColor(field),
        });
        startMeters = endMeters;
      }
    });

    return zones;
  }

  function getPreliminaryZone(field: BasicDataField, value: string) {
    if (!isZoneBoundaryField(field)) {
      return null;
    }

    const endMeters = parseNumber(value);
    if (endMeters == null) {
      return null;
    }

    const startMeters = getZoneBoundaryStartMeters(field);
    return {
      id: `${field.id}-preview`,
      label: typeof field.zone_label === 'string' ? field.zone_label : field.label.replace(/\s*slutlängd$/i, ''),
      startMeters,
      endMeters,
      color: getZoneBoundaryColor(field),
    };
  }

  function getZoneLegendItems(zones: TransectZone[], preliminaryZone: TransectZone | null = null) {
    const items = zones
      .filter(zone => Number.isFinite(zone.startMeters) && Number.isFinite(zone.endMeters) && zone.endMeters > zone.startMeters)
      .map(zone => ({id: zone.id, label: zone.label, color: zone.color}));

    if (
      preliminaryZone &&
      Number.isFinite(preliminaryZone.startMeters) &&
      Number.isFinite(preliminaryZone.endMeters) &&
      preliminaryZone.endMeters > preliminaryZone.startMeters
    ) {
      items.push({
        id: preliminaryZone.id,
        label: `${preliminaryZone.label} preliminär`,
        color: preliminaryZone.color,
      });
    }

    return items;
  }

  function getZoneMapKey(prefix: string, zones: TransectZone[], preliminaryZone: TransectZone | null = null) {
    return [
      prefix,
      ...zones.map(zone => `${zone.id}:${zone.startMeters}:${zone.endMeters}:${zone.color}`),
      preliminaryZone
        ? `${preliminaryZone.id}:${preliminaryZone.startMeters}:${preliminaryZone.endMeters}:${preliminaryZone.color}`
        : '',
    ].join('|');
  }

  function renderZoneLegend(zones: TransectZone[], preliminaryZone: TransectZone | null = null) {
    const items = getZoneLegendItems(zones, preliminaryZone);
    if (items.length === 0) {
      return null;
    }

    return (
      <View style={styles.zoneLegend}>
        <Text style={styles.zoneLegendTitle}>Zoner</Text>
        <View style={styles.zoneLegendRows}>
          {items.map(item => (
            <View key={item.id} style={styles.zoneLegendItem}>
              <View style={[styles.zoneLegendSwatch, {backgroundColor: item.color}]} />
              <Text style={styles.zoneLegendLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function handleTransectMapMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {type?: string; layer?: string};
      if (message.type === 'layer' && (message.layer === 'topo' || message.layer === 'orto')) {
        transectMapLayerRef.current = message.layer;
      }
    } catch {
      // Ignorera okända meddelanden från kartans WebView.
    }
  }

  function handlePlotSelectionMapMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {type?: string; row?: Record<string, string>};
      if (message.type === 'plot' && message.row) {
        promptCreateInventoryFromMap(message.row);
      }
    } catch {
      // Ignorera okända meddelanden från provytekartan.
    }
  }

  const handleManualUpdate = useCallback(async () => {
    try {
      setIsUpdating(true);
      const updated = await runManualBasicDataUpdate(basicData ?? undefined);
      const updatedDatasets = await loadConfiguredDatasets(updated);
      const updatedArtLists = await loadConfiguredArtResources(updated);
      const updatedOldInventoryData = await loadOldInventoryData();
      setBasicData(updated);
      setDatasets(updatedDatasets);
      setArtLists(updatedArtLists);
      setOldInventoryData(updatedOldInventoryData);
      setUpdateVersion(null);
      Alert.alert('Klart', 'basic_data och tillhörande resurser uppdaterades.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Uppdateringen misslyckades.';
      Alert.alert('Kunde inte uppdatera', message);
    } finally {
      setIsUpdating(false);
    }
  }, [basicData]);

  const saveReadServerMessageKeys = useCallback(async (keys: Set<string>) => {
    setReadServerMessageKeys(new Set(keys));
    await AsyncStorage.setItem(MESSAGE_READ_KEYS_STORAGE_KEY, JSON.stringify(Array.from(keys)));
  }, []);

  const markServerMessageRead = useCallback(
    async (message: ServerMessage) => {
      const nextKeys = new Set(readServerMessageKeys);
      nextKeys.add(message.key);
      await saveReadServerMessageKeys(nextKeys);
      setServerMessages(prev => prev.map(item => (item.key === message.key ? {...item, read: true} : item)));
    },
    [readServerMessageKeys, saveReadServerMessageKeys],
  );

  const refreshServerMessages = useCallback(
    async (showAlerts = false) => {
      try {
        const files = await listServerMessagesFromSftp();
        const messages = files
          .map(file => {
            const modifiedAt = Number(file.modifiedAt);
            const size = Number(file.size);
            const key = `${file.fileName}:${Number.isFinite(modifiedAt) ? Math.round(modifiedAt) : 0}:${
              Number.isFinite(size) ? size : 0
            }`;
            return {
              key,
              fileName: file.fileName,
              modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : 0,
              size: Number.isFinite(size) ? size : 0,
              text: file.text ?? '',
              read: readServerMessageKeys.has(key),
            };
          })
          .sort((left, right) => right.modifiedAt - left.modifiedAt);

        setServerMessages(messages);

        if (showAlerts) {
          const unread = messages.find(message => !message.read && !announcedMessageKeys.current.has(message.key));
          if (unread) {
            announcedMessageKeys.current.add(unread.key);
            Alert.alert(unread.fileName, unread.text || 'Tomt meddelande.', [
              {
                text: 'OK',
                onPress: () => {
                  markServerMessageRead(unread).catch(() => undefined);
                },
              },
            ]);
          }
        }
      } catch {
        // Meddelandekontrollen ska aldrig störa inventeringen om servern inte nås.
      }
    },
    [markServerMessageRead, readServerMessageKeys],
  );

  useEffect(() => {
    const run = async () => {
      await boot();
    };

    run().catch(() => {
      // boot hanterar fel via UI och alert
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(MESSAGE_READ_KEYS_STORAGE_KEY)
      .then(raw => {
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        if (Array.isArray(parsed)) {
          setReadServerMessageKeys(new Set(parsed.filter((value): value is string => typeof value === 'string')));
        }
      })
      .catch(() => undefined)
      .finally(() => setServerMessageReadKeysLoaded(true));
  }, []);

  useEffect(() => {
    if (!serverMessageReadKeysLoaded) {
      return undefined;
    }

    refreshServerMessages(true).catch(() => undefined);
    const interval = setInterval(() => {
      refreshServerMessages(true).catch(() => undefined);
    }, MESSAGE_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refreshServerMessages, serverMessageReadKeysLoaded]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardInset(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
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
    if (!basicData || !Array.isArray(draft.deponi_rows)) {
      return;
    }

    const rows = getRepeaterRows(draft.deponi_rows);
    const normalizedRows = normalizeDeponiRows(rows, basicData.lists.deponi_kategorier ?? []);
    if (JSON.stringify(rows) !== JSON.stringify(normalizedRows)) {
      setDraft(prev => ({...prev, deponi_rows: normalizedRows}));
    }
  }, [basicData, draft.deponi_rows]);

  useEffect(() => {
    if (!basicData || !Array.isArray(draft.habitat_rows)) {
      return;
    }

    const rows = getRepeaterRows(draft.habitat_rows);
    const normalizedRows = normalizeHabitatRows(rows);
    if (JSON.stringify(rows) !== JSON.stringify(normalizedRows)) {
      setDraft(prev => ({...prev, habitat_rows: normalizedRows}));
    }
    // normalizeHabitatRows läser bara radinnehåll och ska köras när habitatrader ändras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basicData, draft.habitat_rows]);

  useEffect(() => {
    if (!basicData || !Array.isArray(draft.dynhabitat_rows)) {
      return;
    }

    const field = findConfiguredTopLevelField('dynhabitat_rows');
    if (!isFordynHabitatRowsField(field)) {
      return;
    }

    const rows = getRepeaterRows(draft.dynhabitat_rows);
    const normalizedRows = normalizeFordynHabitatRows(rows);
    if (JSON.stringify(rows) !== JSON.stringify(normalizedRows)) {
      setDraft(prev => ({...prev, dynhabitat_rows: normalizedRows}));
    }
    // normalizeFordynHabitatRows läser aktuell draft och ska köras när raderna eller habitatintervallet ändras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basicData, draft.dynhabitat_rows, draft.habitat_rows]);

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
      const loadedOldInventoryData = await loadOldInventoryData();
      const loadedInventories = await loadInventoryIndex();
      const firstTabId = result.basicData.tabs[0]?.id ?? '';

      setBasicData(result.basicData);
      setDatasets(loadedDatasets);
      setArtLists(loadedArtLists);
      setOldInventoryData(loadedOldInventoryData);
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

  function isRequiredFieldMissing(field: BasicDataField, value: unknown) {
    if (!field.required) {
      return false;
    }

    if (field.type === 'gps_capture') {
      return !isStoredGpsPoint(value);
    }

    if (field.type === 'inventory_uuid') {
      return !isValidUuid(value);
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    if (value && typeof value === 'object') {
      return Object.keys(value).length === 0;
    }

    return value === undefined || value === null || String(value).trim() === '';
  }

  function getMissingRequiredFields() {
    if (!basicData) {
      return [];
    }

    const missing: Array<{fieldId: string; label: string; tabId?: string; tabLabel?: string}> = [];
    const seen = new Set<string>();

    const visitField = (fieldOrId: string | BasicDataField, tabId?: string, tabLabel?: string) => {
      const field = resolveField(fieldOrId);
      if (!field?.required || seen.has(field.id)) {
        return;
      }

      seen.add(field.id);
      if (isRequiredFieldMissing(field, draft[field.id])) {
        missing.push({
          fieldId: field.id,
          label: field.label,
          tabId,
          tabLabel,
        });
      }
    };

    basicData.tabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.fields.forEach(fieldOrId => visitField(fieldOrId, tab.id, tab.label));
      });
    });
    basicData.global_fields?.forEach(field => visitField(field));

    return missing;
  }

  async function handleManualExport() {
    if (!basicData) {
      Alert.alert('Export saknar grunddata', 'Appen behöver ha läst in basic_data innan export kan skapas.');
      return;
    }

    if (!hasSelectedPlot) {
      Alert.alert('Välj provyta först', 'Välj ruta och provyta innan du skapar JSON-exporten.');
      return;
    }

    const missingRequiredFields = getMissingRequiredFields();
    if (missingRequiredFields.length > 0) {
      const firstMissingTabId = missingRequiredFields.find(item => item.tabId)?.tabId;
      const missingText = missingRequiredFields
        .slice(0, 12)
        .map(item => `• ${item.tabLabel ? `${item.tabLabel}: ` : ''}${item.label}`)
        .join('\n');
      const overflowText =
        missingRequiredFields.length > 12 ? `\n...och ${missingRequiredFields.length - 12} till.` : '';

      Alert.alert(
        'Obligatoriska fält saknas',
        `Fyll i dessa innan export skapas:\n\n${missingText}${overflowText}`,
        [
          {text: 'Avbryt', style: 'cancel'},
          firstMissingTabId
            ? {
                text: 'Gå till första',
                onPress: () => setActiveTabId(firstMissingTabId),
              }
            : {text: 'OK'},
        ],
      );
      return;
    }

    try {
      setIsExporting(true);
      await saveWorkingDraft(draft);
      const result = await exportDraftToJson({basicData, draft});
      const uploadResult = await uploadExportAndPhotosToSftp({
        exportPath: result.path,
        exportFileName: result.fileName,
        photos: result.photos,
      });
      const item = await markInventorySubmitted(draft);
      if (item) {
        setInventories(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
      }
      Alert.alert(
        'JSON-export skapad och uppladdad',
        `Fil: ${result.fileName}\nFoton i exporten: ${result.photoCount}\n\nUppladdat: ${
          uploadResult.export.uploaded + uploadResult.photos.uploaded
        } filer\nRedan aktuella: ${uploadResult.export.skipped + uploadResult.photos.skipped} filer\nSaknade: ${
          uploadResult.export.missing + uploadResult.photos.missing
        } filer\n\nSökväg:\n${result.path}`,
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

  function updateDraftValues(values: Record<string, unknown>) {
    setDraft(prev => ({...prev, ...values}));
  }

  function getMissingStartPointLabels(sourceDraft = draft) {
    const missing: string[] = [];
    if (!isStoredGpsPoint(sourceDraft.startpunkt)) {
      missing.push('Startpunkt');
    }
    if (!isStoredGpsPoint(sourceDraft.slutpunkt)) {
      missing.push('Slutpunkt');
    }
    return missing;
  }

  function canLeaveStartImagesTab(targetTabId: string) {
    if (
      activeTabId !== NORMAL_INVENTORY_TAB_ID ||
      targetTabId === NORMAL_INVENTORY_TAB_ID ||
      draft.inventeringstyp !== 'normal'
    ) {
      return true;
    }

    const missing = getMissingStartPointLabels();
    if (missing.length === 0) {
      return true;
    }

    Alert.alert(
      'Sätt start och slutpunkt',
      `Du behöver sätta ${missing.join(' och ')} under Start & bilder innan du fortsätter.`,
    );
    return false;
  }

  function handleSelectTab(tabId: string) {
    if (!canLeaveStartImagesTab(tabId)) {
      return;
    }

    setActiveTabId(tabId);
  }

  function getGpsCaptureValues(fieldId: string, point: StoredGpsPoint) {
    const values: Record<string, unknown> = {[fieldId]: point};
    const field = findConfiguredTopLevelField(fieldId);
    const outputs = field ? getStringArrayProperty(field, 'outputs') : [];

    outputs.forEach(output => {
      const outputKey = output.toLowerCase();
      if (outputKey.includes('altitudeaccuracy') || outputKey.includes('heightaccuracy')) {
        values[output] = point.altitudeAccuracy ?? null;
      } else if (outputKey.includes('altitude') || outputKey.includes('height')) {
        values[output] = point.altitude ?? null;
      } else if (outputKey.includes('east')) {
        values[output] = point.longitude;
      } else if (outputKey.includes('north')) {
        values[output] = point.latitude;
      } else if (outputKey.includes('accuracy')) {
        values[output] = point.accuracy ?? null;
      } else if (outputKey.includes('timestamp')) {
        values[output] = point.timestamp;
      }
    });

    return values;
  }

  function saveGpsCapture(field: BasicDataField, snapshot: GpsSnapshot) {
    if (snapshot.status !== 'ok' || typeof snapshot.latitude !== 'number' || typeof snapshot.longitude !== 'number') {
      showValidationToast(snapshot.message || 'Kunde inte läsa GPS-position.');
      return;
    }

    const timestamp = snapshot.timestamp ?? Date.now();
    const point: StoredGpsPoint = {
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      altitude: typeof snapshot.altitude === 'number' ? snapshot.altitude : null,
      altitudeAccuracy: typeof snapshot.altitudeAccuracy === 'number' ? snapshot.altitudeAccuracy : null,
      accuracy: snapshot.accuracy,
      timestamp,
    };
    const values = getGpsCaptureValues(field.id, point);

    updateDraftValues(values);
    showValidationToast(`${field.label} sparad.`);
  }

  async function setZoneBoundaryFromGps(field: BasicDataField) {
    const geometry = getTransectGeometry();
    if (!geometry) {
      showValidationToast('Välj provyta med transekt innan GPS kan användas.');
      return;
    }

    const nextGps = await refreshGps();
    if (typeof nextGps.latitude !== 'number' || typeof nextGps.longitude !== 'number') {
      showValidationToast(nextGps.message || 'Kunde inte läsa GPS-position.');
      return;
    }

    const userPoint = latLonToRelativeMeters(geometry.startLat, geometry.startLon, nextGps.latitude, nextGps.longitude);
    const meters = getDistanceAlongSegmentMeters(userPoint, geometry.start, geometry.end);
    const formatted = meters < 1 ? meters.toFixed(1) : String(Math.round(meters));
    const previousEndMeters = getZoneBoundaryStartMeters(field);

    if (meters < previousEndMeters) {
      showValidationToast(`GPS-positionen ligger före föregående zongräns (${previousEndMeters} m).`);
      return;
    }

    if (editingField?.field.id === field.id) {
      setEditingField(prev => (prev ? {...prev, value: formatted} : prev));
    } else {
      updateDraftValue(field.id, formatted);
    }

    showValidationToast(`${field.label}: ${formatted} m från startpunkten.`);
  }

  function createCleanDraftForPlot(row: Record<string, string>) {
    const role = typeof draft.inventering_roll === 'string' ? draft.inventering_roll : '';
    const nextDraft: Record<string, unknown> = {
      lagnummer,
      inventerare,
      ruta: row.ruta ?? '',
      provyta: row.provyta ?? '',
      pyid: row.pyid ?? '',
    };

    if (typeof draft.antal_inventerare === 'string') {
      nextDraft.antal_inventerare = draft.antal_inventerare;
    }

    if (role) {
      nextDraft.inventering_roll = role;
    }

    if (role === 'master') {
      nextDraft.inventering_uuid = uuidv4();
    }

    return nextDraft;
  }

  function selectPlotRow(row: Record<string, string>) {
    const nextDraft = createCleanDraftForPlot(row);
    setDraft(nextDraft);
    setManualUuidInput(typeof nextDraft.inventering_uuid === 'string' ? nextDraft.inventering_uuid : '');
    saveWorkingDraft(nextDraft).catch(() => {
      // Autosparningen försöker igen på nästa draft-ändring.
    });
    setOpenDatasetFieldId(null);
  }

  function startNewInventory() {
    const nextDraft: Record<string, unknown> = {
      lagnummer,
      inventerare,
    };

    if (typeof draft.antal_inventerare === 'string') {
      nextDraft.antal_inventerare = draft.antal_inventerare;
    }

    if (typeof draft.inventering_roll === 'string') {
      nextDraft.inventering_roll = draft.inventering_roll;
    }

    if (draft.inventering_roll === 'master') {
      nextDraft.inventering_uuid = uuidv4();
    }

    setDraft(nextDraft);
    setManualUuidInput(typeof nextDraft.inventering_uuid === 'string' ? nextDraft.inventering_uuid : '');
    setActiveTabId('oversikt');
    setShowInventoryListModal(false);
    setOpenDatasetFieldId(null);
    saveWorkingDraft(nextDraft).catch(() => {
      // Autosparningen försöker igen på nästa draft-ändring.
    });
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

  async function openInventory(item: InventoryListItem) {
    try {
      const inventoryDraft = await loadInventoryDraftSnapshot(item);
      if (!inventoryDraft) {
        Alert.alert('Inventeringen saknas', 'Den sparade inventeringsfilen hittades inte på telefonen.');
        return;
      }

      setDraft(inventoryDraft);
      setManualUuidInput(typeof inventoryDraft.inventering_uuid === 'string' ? inventoryDraft.inventering_uuid : '');
      setLagnummerInput(typeof inventoryDraft.lagnummer === 'string' ? inventoryDraft.lagnummer : lagnummer);
      setInventerareInput(typeof inventoryDraft.inventerare === 'string' ? inventoryDraft.inventerare : inventerare);
      setActiveTabId('oversikt');
      setShowInventoryListModal(false);
      setOpenDatasetFieldId(null);
      setOpenRepeaterDatasetKey(null);
      setRepeaterDatasetSearch({});
      setArtSearchByField({});
      await saveWorkingDraft(inventoryDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kunde inte öppna inventeringen.';
      Alert.alert('Öppningsfel', message);
    }
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

    if (isZoneBoundaryField(field)) {
      const numericValue = parseNumber(value);
      const previousEndMeters = getZoneBoundaryStartMeters(field);
      const geometry = getTransectGeometry();

      if (numericValue == null) {
        showValidationToast('Ange slutlängd i meter.');
        return;
      }

      if (numericValue < previousEndMeters) {
        showValidationToast(`Slutlängden måste vara minst ${previousEndMeters} m.`);
        return;
      }

      if (geometry && numericValue > geometry.lengthMeters) {
        showValidationToast(`Slutlängden kan inte vara längre än transekten (${geometry.lengthMeters} m).`);
        return;
      }
    }

    updateDraftValue(field.id, value);
    setEditingField(null);
  }

  function renderOldStrandtypDialogInfo(field: BasicDataField) {
    if (field.id !== 'strandtyp' || !currentOldInventoryData?.strandtyp) {
      return null;
    }

    return (
      <View style={styles.oldInventoryInfoCard}>
        <Text style={styles.oldInventoryInfoTitle}>Inventeringsdata 2021</Text>
        <Text style={styles.oldInventoryInfoText}>Strandtyp: {currentOldInventoryData.strandtyp}</Text>
      </View>
    );
  }

  function renderOldHabitatDataCard() {
    const habitat = currentOldInventoryData?.habitat ?? [];
    if (habitat.length === 0) {
      return null;
    }

    return (
      <View style={styles.oldInventoryInfoCard}>
        <Text style={styles.oldInventoryInfoTitle}>Inventeringsdata 2021</Text>
        {habitat.map((item, index) => (
          <Text key={`${item.kod}-${index}`} style={styles.oldInventoryInfoText}>
            {item.kod}
            {item.namn ? ` - ${item.namn}` : ''}
          </Text>
        ))}
      </View>
    );
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
        {isZoneBoundaryField(field) ? (
          <Pressable
            accessibilityLabel={`Sätt ${field.label} med GPS`}
            accessibilityRole="button"
            onPress={event => {
              event.stopPropagation();
              setZoneBoundaryFromGps(field).catch(error => {
                showValidationToast(error instanceof Error ? error.message : 'Kunde inte läsa GPS-position.');
              });
            }}
            style={styles.promptGpsButton}>
            <Text style={styles.promptGpsButtonText}>GPS</Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
  }

  function openUserSettings() {
    setLagnummerInput(lagnummer);
    setInventerareInput(inventerare);
    setShowUserModal(true);
  }

  function openBlalappModal() {
    setBlalappInput(getStringValue(draft[BLALAPP_TEXT_FIELD_ID]).slice(0, BLALAPP_MAX_LENGTH));
    setShowBlalappModal(true);
  }

  function saveBlalapp() {
    updateDraftValue(BLALAPP_TEXT_FIELD_ID, blalappInput.slice(0, BLALAPP_MAX_LENGTH));
    setShowBlalappModal(false);
    showValidationToast('Blålapp sparad.');
  }

  function getBlalappPhoto() {
    return isPhotoEntry(draft[BLALAPP_PHOTO_FIELD_ID]) ? draft[BLALAPP_PHOTO_FIELD_ID] : null;
  }

  function takeBlalappPhoto() {
    openPhotoCapture({
      fieldId: BLALAPP_PHOTO_FIELD_ID,
      mode: 'single',
      category: 'blalapp',
      label: 'Blålapp',
      typeValue: 'blalapp',
      typeLabel: 'Blålapp',
    }).catch(() => undefined);
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
    const sessionPayload = parseSessionCode(rawValue);

    if (!sessionPayload) {
      Alert.alert(
        'Ogiltig kod',
        source === 'scan'
          ? 'QR-koden innehöll inget giltigt inventeringstillfälle.'
          : 'Ange ett giltigt UUID eller skanna master-koden.',
      );
      return;
    }

    const nextValues: Record<string, unknown> = {
      inventering_uuid: sessionPayload.uuid,
      inventering_roll: 'hjalpare',
    };

    if (sessionPayload.ruta) {
      nextValues.ruta = sessionPayload.ruta;
    }
    if (sessionPayload.provyta) {
      nextValues.provyta = sessionPayload.provyta;
    }
    if (sessionPayload.lagnummer) {
      nextValues.lagnummer = sessionPayload.lagnummer;
    }
    if (sessionPayload.startpunkt) {
      Object.assign(nextValues, getGpsCaptureValues('startpunkt', sessionPayload.startpunkt));
    }
    if (sessionPayload.slutpunkt) {
      Object.assign(nextValues, getGpsCaptureValues('slutpunkt', sessionPayload.slutpunkt));
    }

    setDraft(prev => ({
      ...prev,
      ...nextValues,
      inventering_roll: prev.inventering_roll === 'master' ? prev.inventering_roll : nextValues.inventering_roll,
    }));
    setManualUuidInput(sessionPayload.uuid);
    setShowScannerModal(false);

    if (sessionPayload.startpunkt && sessionPayload.slutpunkt) {
      showValidationToast('UUID, startpunkt och slutpunkt hämtades från QR-koden.');
    } else {
      showValidationToast('UUID hämtades från QR-koden.');
    }
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

  function getPhotoNameParts(photoName: string) {
    const inventorId = getInventerareFileId(draft);
    return inventorId ? [getPhotoPlotId(), photoName, inventorId] : [getPhotoPlotId(), photoName];
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
            : photoCaptureTarget.mode === 'rowPhotoArray' &&
                photoCaptureTarget.replaceExisting &&
                photoCaptureTarget.rowId &&
                photoCaptureTarget.nestedFieldId
              ? getRepeaterRows(draft[photoCaptureTarget.fieldId])
                  .find(row => row.id === photoCaptureTarget.rowId)
                  ?.[photoCaptureTarget.nestedFieldId]
            : null;
      if (isPhotoEntry(existingReplacementPhoto)) {
        await deleteFileIfExists(existingReplacementPhoto.path);
      } else if (Array.isArray(existingReplacementPhoto)) {
        await Promise.all(
          existingReplacementPhoto
            .filter(isPhotoEntry)
            .map(photo => deleteFileIfExists(photo.path).catch(() => undefined)),
        );
      }
      const saved = await saveCapturedPhotoToPublicStorage(captured.uri, {
        plotId,
        category: photoCaptureTarget.category,
        nameParts: getPhotoNameParts(photoName),
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
        altitude: typeof gps.altitude === 'number' ? gps.altitude : null,
        altitudeAccuracy: typeof gps.altitudeAccuracy === 'number' ? gps.altitudeAccuracy : null,
        accuracy: gps.accuracy,
      };
      if (photoCaptureTarget.mode === 'repeater') {
        entry.kommentar = '';
        entry.tag = '';
      }

      if (photoCaptureTarget.mode === 'artObservationPhoto' && photoCaptureTarget.observationId) {
        updateDraftValue(
          photoCaptureTarget.fieldId,
          getArtTableRows(draft[photoCaptureTarget.fieldId]).map(row =>
            row.id === photoCaptureTarget.observationId
              ? {...row, foton: [...getPhotoArray(row.foton), entry]}
              : row,
          ),
        );
      } else if (
        photoCaptureTarget.mode === 'nestedArtObservationPhoto' &&
        photoCaptureTarget.parentRowId &&
        photoCaptureTarget.nestedFieldId &&
        photoCaptureTarget.observationId
      ) {
        const rows = getRepeaterRows(draft[photoCaptureTarget.fieldId]);
        updateDraftValue(
          photoCaptureTarget.fieldId,
          rows.map(row => {
            if (row.id !== photoCaptureTarget.parentRowId || !photoCaptureTarget.nestedFieldId) {
              return row;
            }

            return {
              ...row,
              [photoCaptureTarget.nestedFieldId]: getArtTableRows(row[photoCaptureTarget.nestedFieldId]).map(artRow =>
                artRow.id === photoCaptureTarget.observationId
                  ? {...artRow, foton: [...getPhotoArray(artRow.foton), entry]}
                  : artRow,
              ),
            };
          }),
        );
      } else if (
        photoCaptureTarget.mode === 'rowPhotoArray' &&
        photoCaptureTarget.rowId &&
        photoCaptureTarget.nestedFieldId
      ) {
        const configuredField = findConfiguredTopLevelField(photoCaptureTarget.fieldId);
        const rows =
          configuredField?.type === 'fixed_repeater' && configuredField.id !== 'deponi_rows'
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
              [photoCaptureTarget.nestedFieldId]: photoCaptureTarget.replaceExisting
                ? [entry]
                : [...getPhotoArray(row[photoCaptureTarget.nestedFieldId]), entry],
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

          if (isPhotoEntry(draft[fieldId])) {
            updateDraftValue(fieldId, null);
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
      <View key={field.id} style={[styles.fieldCard, styles.matrixFieldCard]}>
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

  function getPhotoRepeaterTextFields(field: BasicDataField) {
    const fields = getItemSchemaFields(field).filter(item => item.id === 'kommentar' || item.id === 'tag');
    if (fields.length > 0) {
      return fields;
    }

    return [
      {id: 'kommentar', label: 'Kommentar', type: 'text'},
      {id: 'tag', label: 'Tag', type: 'text'},
    ] as BasicDataField[];
  }

  function renderPhotoRepeaterField(field: BasicDataField) {
    const photos = getPhotoArray(draft[field.id]);
    const category = getPhotoCategory(field);
    const textFields = getPhotoRepeaterTextFields(field);

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {photos.length === 0 ? <Text style={styles.fieldHelp}>Inga extra bilder tillagda ännu.</Text> : null}
        {photos.map(photo => (
          <View key={photo.id} style={styles.photoRepeaterItem}>
            {renderPhotoPreview(photo, () => removePhoto(field.id, photo))}
            {textFields.map(textField => {
              const key = textField.id as 'kommentar' | 'tag';
              return (
                <View key={`${photo.id}-${textField.id}`} style={styles.repeaterNestedBlock}>
                  <Text style={styles.repeaterFieldLabel}>{textField.label}</Text>
                  <TextInput
                    multiline={textField.id === 'kommentar'}
                    onChangeText={text => updatePhotoRepeaterText(field.id, photo.id, key, text)}
                    placeholder={textField.label}
                    placeholderTextColor="#8e8579"
                    style={[styles.input, textField.id === 'kommentar' && styles.multilineInput]}
                    value={photo[key] ?? ''}
                  />
                </View>
              );
            })}
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
      configuredField?.type === 'fixed_repeater' && configuredField.id !== 'deponi_rows'
        ? ensureFixedRepeaterRows(configuredField)
        : getRepeaterRows(draft[fieldId]);

    if ((isHabitatTransectRowsField(configuredField) || isFordynHabitatRowsField(configuredField)) && (key === 'slut' || key === 'start')) {
      const nextRows = rows.map(row => (row.id === rowId ? {...row, [key]: value} : row));
      updateDraftValue(fieldId, normalizeRowsForField(configuredField, nextRows));
      return;
    }

    updateDraftValue(
      fieldId,
      rows.map(row => (row.id === rowId ? {...row, [key]: value} : row)),
    );
  }

  function updateRepeaterRowValues(fieldId: string, rowId: string, values: Record<string, unknown>) {
    const configuredField = findConfiguredTopLevelField(fieldId);
    const rows =
      configuredField?.type === 'fixed_repeater' && configuredField.id !== 'deponi_rows'
        ? ensureFixedRepeaterRows(configuredField)
        : getRepeaterRows(draft[fieldId]);

    const nextRows = rows.map(row => (row.id === rowId ? {...row, ...values} : row));
    updateDraftValue(fieldId, normalizeRowsForField(configuredField, nextRows));
  }

  function addRepeaterRow(field: BasicDataField) {
    const rows = getRepeaterRows(draft[field.id]);
    if (isHabitatTransectRowsField(field)) {
      const lengthMeters = getTransectLengthMeters();
      const normalizedRows = normalizeHabitatRows(rows);
      const nextRow = {
        id: uuidv4(),
        start: formatMetersValue(getHabitatRowStart([...normalizedRows, {id: 'preview'}], normalizedRows.length)),
        slut: formatMetersValue(lengthMeters),
      };
      updateDraftValue(field.id, [...normalizedRows, nextRow]);
      return;
    }

    if (isFordynHabitatRowsField(field)) {
      const bounds = getFordynHabitatBounds();
      if (!bounds) {
        showValidationToast('Sätt en habitatrad med kod 2100 innan du lägger till fördynshabitat.');
        return;
      }

      const normalizedRows = normalizeFordynHabitatRows(rows);
      const nextRow = {
        id: uuidv4(),
        start: formatMetersValue(getFordynHabitatRowStart([...normalizedRows, {id: 'preview'}], normalizedRows.length, bounds)),
        slut: formatMetersValue(bounds.endMeters),
      };
      updateDraftValue(field.id, normalizeFordynHabitatRows([...normalizedRows, nextRow]));
      return;
    }

    updateDraftValue(field.id, [...rows, {id: uuidv4()}]);
  }

  function removeRepeaterRow(fieldId: string, rowId: string) {
    Alert.alert('Ta bort rad', 'Vill du ta bort raden?', [
      {text: 'Avbryt', style: 'cancel'},
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          const configuredField = findConfiguredTopLevelField(fieldId);
          const rows = getRepeaterRows(draft[fieldId]).filter(row => row.id !== rowId);
          updateDraftValue(fieldId, normalizeRowsForField(configuredField, rows));
        },
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
            configuredField?.type === 'fixed_repeater' && configuredField.id !== 'deponi_rows'
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

  async function setHabitatRowEndFromGps(parentField: BasicDataField, row: RepeaterRow) {
    const geometry = getTransectGeometry();
    if (!geometry) {
      showValidationToast('Sätt Startpunkt och Slutpunkt innan GPS kan användas för habitat.');
      return;
    }

    const nextGps = await refreshGps();
    if (typeof nextGps.latitude !== 'number' || typeof nextGps.longitude !== 'number') {
      showValidationToast(nextGps.message || 'Kunde inte läsa GPS-position.');
      return;
    }

    const rows = getRepeaterRows(draft[parentField.id]);
    const rowIndex = rows.findIndex(item => item.id === row.id);
    const fordynBounds = isFordynHabitatRowsField(parentField) ? getFordynHabitatBounds() : null;
    if (isFordynHabitatRowsField(parentField) && !fordynBounds) {
      showValidationToast('Sätt en habitatrad med kod 2100 innan GPS kan användas för fördynshabitat.');
      return;
    }

    const rowStart = isFordynHabitatRowsField(parentField)
      ? getFordynHabitatRowStart(rows, rowIndex, fordynBounds ?? undefined) ?? 0
      : getHabitatRowStart(rows, rowIndex);
    const maxEndMeters = fordynBounds?.endMeters ?? geometry.lengthMeters;
    const userPoint = latLonToRelativeMeters(geometry.startLat, geometry.startLon, nextGps.latitude, nextGps.longitude);
    const meters = getDistanceAlongSegmentMeters(userPoint, geometry.start, geometry.end);

    if (meters < rowStart) {
      showValidationToast(`GPS-positionen ligger före radens start (${formatMetersValue(rowStart)} m).`);
      return;
    }

    if (meters > maxEndMeters) {
      showValidationToast(`GPS-positionen ligger efter tillåtet slut (${formatMetersValue(maxEndMeters)} m).`);
      return;
    }

    updateRepeaterRow(parentField.id, row.id, 'slut', formatMetersValue(meters));
    showValidationToast(`Slut: ${formatMetersValue(meters)} m från startpunkten.`);
  }

  async function setRepeaterTransectDistanceFromGps(parentField: BasicDataField, row: RepeaterRow, field: BasicDataField) {
    const geometry = getTransectGeometry();
    if (!geometry) {
      showValidationToast('Sätt Startpunkt och Slutpunkt innan GPS kan användas för avstånd.');
      return;
    }

    const nextGps = await refreshGps();
    if (typeof nextGps.latitude !== 'number' || typeof nextGps.longitude !== 'number') {
      showValidationToast(nextGps.message || 'Kunde inte läsa GPS-position.');
      return;
    }

    const userPoint = latLonToRelativeMeters(geometry.startLat, geometry.startLon, nextGps.latitude, nextGps.longitude);
    const meters = getDistanceAlongSegmentMeters(userPoint, geometry.start, geometry.end);
    updateRepeaterRow(parentField.id, row.id, field.id, formatMetersValue(meters));
    showValidationToast(`${field.label}: ${formatMetersValue(meters)} m från startpunkten.`);
  }

  function renderRepeaterRowField(
    parentField: BasicDataField,
    row: RepeaterRow,
    field: BasicDataField,
    rowIndex = 0,
    rows: RepeaterRow[] = [],
  ) {
    const isRangeRow = (isHabitatTransectRowsField(parentField) || isFordynHabitatRowsField(parentField)) && (field.id === 'start' || field.id === 'slut');
    const rowValue =
      field.id === 'start' && isRangeRow
        ? isFordynHabitatRowsField(parentField)
          ? formatMetersValue(getFordynHabitatRowStart(rows, rowIndex))
          : formatMetersValue(getHabitatRowStart(rows, rowIndex))
        : row[field.id];

    if (field.type === 'art_table') {
      return renderNestedArtTableField(parentField, row, field);
    }

    if (field.type === 'photo_array') {
      const photos = getPhotoArray(rowValue);
      const category = getPhotoCategory(field);
      const maxCount = parseNumber(field.max_count);
      const replaceExisting = maxCount === 1;
      const photoNamePrefix = getStringProperty(field, 'photo_name_prefix') || field.id;
      const photoName = `${photoNamePrefix}_${rowIndex + 1}`;
      const categoryOptions =
        parentField.id === 'deponi_rows' ? basicData?.lists.deponi_kategorier ?? [] : [];
      const rowCategoryLabel =
        categoryOptions.length > 0
          ? getListOptionLabel(categoryOptions, row.kategori)
          : `${field.label} ${rowIndex + 1}`;
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
                typeValue: replaceExisting ? photoName : String(row.kategori ?? row.id),
                typeLabel: rowCategoryLabel,
                replaceExisting,
              }).catch(() => undefined)
            }
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{replaceExisting && photos.length > 0 ? 'Byt bild' : 'Lägg till bild'}</Text>
          </Pressable>
        </View>
      );
    }

    if (field.type === 'dataset_search') {
      const datasetId = getStringProperty(field, 'dataset');
      const valueKey = getStringProperty(field, 'value_key') || 'value';
      const displayKey = getStringProperty(field, 'display_key') || 'label';
      const targetValueField = getStringProperty(field, 'target_value_field') || field.id;
      const targetLabelField = getStringProperty(field, 'target_label_field');
      const searchKey = `${parentField.id}:${row.id}:${field.id}`;
      const selectedCode = getStringValue(row[targetValueField]);
      const selectedName = targetLabelField ? getStringValue(row[targetLabelField]) : '';
      const selectedDatasetCode = getStringValue(row[valueKey]);
      const selectedDatasetName = getStringValue(row[displayKey]);
      const selectedLabel =
        selectedCode && selectedName
          ? `${selectedCode} - ${selectedName}`
          : selectedDatasetCode && selectedDatasetName
            ? `${selectedDatasetCode} - ${selectedDatasetName}`
            : getStringValue(row[field.id]) || selectedCode || selectedName || selectedDatasetCode || selectedDatasetName;
      const searchText = repeaterDatasetSearch[searchKey] ?? selectedLabel;
      const normalizedSearch = searchText.trim().toLowerCase();
      const datasetRows = datasetId ? datasets[datasetId] ?? [] : [];
      const filteredRows = datasetRows
        .filter(datasetRow => {
          if (!normalizedSearch || searchText === selectedLabel) {
            return true;
          }

          const optionLabel = formatDatasetSearchLabel(datasetRow, valueKey, displayKey).toLowerCase();
          return optionLabel.includes(normalizedSearch);
        })
        .slice(0, 40);
      const isOpen = openRepeaterDatasetKey === searchKey;

      return (
        <View key={field.id} style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
          <TextInput
            onChangeText={text => {
              setRepeaterDatasetSearch(prev => ({...prev, [searchKey]: text}));
              setOpenRepeaterDatasetKey(searchKey);
            }}
            onFocus={() => setOpenRepeaterDatasetKey(searchKey)}
            placeholder="Sök kod eller namn"
            placeholderTextColor="#8e8579"
            style={styles.input}
            value={searchText}
          />
          {isOpen ? (
            <ScrollView nestedScrollEnabled style={styles.repeaterListbox}>
              {filteredRows.length === 0 ? (
                <Text style={styles.repeaterListboxEmptyText}>Inga träffar.</Text>
              ) : (
                filteredRows.map((datasetRow, optionIndex) => {
                  const optionCode = datasetRow[valueKey] ?? '';
                  const optionName = datasetRow[displayKey] ?? '';
                  const optionLabel = formatDatasetSearchLabel(datasetRow, valueKey, displayKey);
                  const selected = optionCode === selectedCode && (!targetLabelField || optionName === selectedName);
                  return (
                    <Pressable
                      key={`${searchKey}-${optionCode}-${optionIndex}`}
                      onPress={() => {
                        const values: Record<string, unknown> = {
                          [field.id]: optionLabel,
                          [targetValueField]: optionCode,
                          [valueKey]: optionCode,
                        };
                        if (targetLabelField) {
                          values[targetLabelField] = optionName;
                        }
                        values[displayKey] = optionName;
                        updateRepeaterRowValues(parentField.id, row.id, values);
                        setRepeaterDatasetSearch(prev => ({...prev, [searchKey]: optionLabel}));
                        setOpenRepeaterDatasetKey(null);
                      }}
                      style={[styles.repeaterListboxItem, selected && styles.repeaterListboxItemSelected]}>
                      <Text style={[styles.repeaterListboxText, selected && styles.repeaterListboxTextSelected]}>
                        {optionLabel}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          ) : null}
        </View>
      );
    }

    if (field.type === 'select' || field.type === 'boolean_select') {
      const options = field.list_id ? basicData?.lists[field.list_id] ?? [] : [];
      const useListbox = field.presentation === 'listbox' || options.length > 8;
      if (useListbox) {
        return (
          <View key={field.id} style={styles.repeaterNestedBlock}>
            <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
            <ScrollView nestedScrollEnabled style={styles.repeaterListbox}>
              {options.map(option => {
                const optionValue = getListOptionValue(option);
                const selected = rowValue === optionValue || rowValue === option.label;
                return (
                  <Pressable
                    key={`${row.id}-${field.id}-${optionValue}`}
                    onPress={() => updateRepeaterRow(parentField.id, row.id, field.id, optionValue)}
                    style={[styles.repeaterListboxItem, selected && styles.repeaterListboxItemSelected]}>
                    <Text style={[styles.repeaterListboxText, selected && styles.repeaterListboxTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      }

      return (
        <View key={field.id} style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
          <View style={styles.optionWrap}>
            {options.map(option => {
              const optionValue = getListOptionValue(option);
              const selected = rowValue === optionValue || rowValue === option.label;
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

    if (isRangeRow || isTransectDistanceField(field)) {
      const isStartField = field.id === 'start';
      return (
        <View key={field.id} style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
          <View style={styles.dialogInputRow}>
            <TextInput
              editable={!isStartField}
              keyboardType="numeric"
              onChangeText={text => updateRepeaterRow(parentField.id, row.id, field.id, text)}
              placeholder={field.unit ? `Ange värde (${field.unit})` : 'Ange värde'}
              placeholderTextColor="#8e8579"
              style={[styles.input, styles.dialogInput, isStartField && styles.inputDisabled]}
              value={String(rowValue ?? '')}
            />
            {!isStartField ? (
              <Pressable
                accessibilityLabel={`Sätt ${field.label} med GPS`}
                accessibilityRole="button"
                onPress={() => {
                  const action = isTransectDistanceField(field)
                    ? setRepeaterTransectDistanceFromGps(parentField, row, field)
                    : setHabitatRowEndFromGps(parentField, row);
                  action.catch(error => {
                    showValidationToast(error instanceof Error ? error.message : 'Kunde inte läsa GPS-position.');
                  });
                }}
                style={styles.promptGpsButton}>
                <Text style={styles.promptGpsButtonText}>GPS</Text>
              </Pressable>
            ) : null}
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

  function getRepeaterRowsForRender(field: BasicDataField) {
    const rows = getRepeaterRows(draft[field.id]);
    if (field.id === 'deponi_rows') {
      return normalizeDeponiRows(rows, basicData?.lists.deponi_kategorier ?? []);
    }

    return normalizeRowsForField(field, rows);
  }

  function getRepeaterRowTitle(field: BasicDataField, row: RepeaterRow, index: number) {
    if (field.id === 'deponi_rows') {
      const categoryLabel = getListOptionLabel(basicData?.lists.deponi_kategorier ?? [], row.kategori);
      return categoryLabel || `Deponiobjekt ${index + 1}`;
    }

    const code = getStringValue(row.kod);
    const name = getStringValue(row.namn);
    if (code || name) {
      return code && name ? `${code} - ${name}` : code || name;
    }

    return String(row.kategori ?? `Rad ${index + 1}`);
  }

  function renderRepeaterField(field: BasicDataField, fixed = false) {
    const rows = fixed ? ensureFixedRepeaterRows(field) : getRepeaterRowsForRender(field);
    const itemFields = getItemSchemaFields(field);
    const fordynBounds = isFordynHabitatRowsField(field) ? getFordynHabitatBounds() : null;
    const fordynDisabled = isFordynHabitatRowsField(field) && !fordynBounds;

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {fordynDisabled ? (
          <Text style={styles.fieldHelp}>Fördynshabitat tänds när en habitatrad med kod 2100 har satts.</Text>
        ) : null}
        {rows.length === 0 ? <Text style={styles.fieldHelp}>Inga rader tillagda ännu.</Text> : null}
        {rows.map((row, index) => (
          <View key={row.id} style={styles.repeaterRowCard}>
            <View style={styles.repeaterRowHeader}>
              <Text style={styles.repeaterRowTitle}>{getRepeaterRowTitle(field, row, index)}</Text>
              {!fixed ? (
                <Pressable onPress={() => removeRepeaterRow(field.id, row.id)} style={styles.smallDangerButton}>
                  <Text style={styles.smallDangerButtonText}>Ta bort</Text>
                </Pressable>
              ) : null}
            </View>
            {itemFields.map(itemField => renderRepeaterRowField(field, row, itemField, index, rows))}
          </View>
        ))}
        {!fixed && !fordynDisabled ? (
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
    const currentColumnTotal = Object.entries(current).reduce((total, [currentRowId, rowValues]) => {
      if (currentRowId === rowId) {
        return total;
      }

      const rowValue = Number(rowValues?.[columnId] ?? 0);
      return Number.isFinite(rowValue) ? total + rowValue : total;
    }, 0);
    const nextValue = Number(numericValue || 0);
    const adjustedValue = Math.max(0, Math.min(nextValue, 100 - currentColumnTotal));

    if (adjustedValue !== nextValue) {
      showValidationToast(`Värdet justerades till ${adjustedValue} så att summan blir 100 procent.`);
    }

    updateDraftValue(fieldId, {
      ...current,
      [rowId]: {
        ...currentRow,
        [columnId]: numericValue === '' ? '' : String(adjustedValue),
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
    const categoryListId = typeof field.category_list_id === 'string' ? field.category_list_id : 'artkategorier';
    const options = basicData?.lists[categoryListId] ?? [];
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

  function getArtOptionsForField(field: BasicDataField, category: string | null) {
    const artRows = category ? artLists[category] ?? [] : [];
    const categoryListId = typeof field.category_list_id === 'string' ? field.category_list_id : 'artkategorier';

    if (categoryListId !== 'artkategorier') {
      return artRows;
    }

    const wantedTable = category === 'trad' ? 'trad' : category === 'buskar' ? 'buskar' : 'arter';
    return artRows.filter(art => !art.table || art.table === wantedTable);
  }

  function getEffectiveArtRegistrationMode(art: ArtResourceRow, category: string | null, entryMode?: string) {
    if (art.registrationMode === 'bush' || category === 'buskar' || art.table === 'buskar') {
      return 'bush';
    }

    if (entryMode === 'presence_observation') {
      return 'presence';
    }

    return art.registrationMode;
  }

  function shouldCaptureCoordinateForArt(entryMode: string | undefined, registrationMode: ArtResourceRow['registrationMode']) {
    return entryMode === 'species_observation' || registrationMode === 'bush';
  }

  function shouldPromptPhotoForAtlasArt(art: ArtResourceRow) {
    const currentRuta = String(draft.ruta ?? '').trim();
    const taxonId = art.taxonId.trim();
    const atlasRows = datasets.atlasartlista_havsstrand ?? [];

    if (!currentRuta || !taxonId || atlasRows.length === 0) {
      return false;
    }

    return !atlasRows.some(row => {
      if (row.taxonid !== taxonId) {
        return false;
      }

      return row.trakter
        .split('-')
        .map(value => value.trim())
        .includes(currentRuta);
    });
  }

  function showAtlasPhotoPrompt(art: ArtResourceRow) {
    const displayName = art.swedishName || art.scientificName || 'Arten';
    Alert.alert(
      'Ta foto av arten',
      `${displayName} finns inte i atlaslistan för ruta ${ruta || '-'}. Ta ett foto kopplat till artobservationen.`,
    );
  }

  async function addArtRow(
    field: BasicDataField,
    art: ArtResourceRow,
    columns: string[],
    category: string | null,
    entryMode?: string,
  ) {
    const nameColumn = getArtNameColumn(columns);
    const rows = getArtTableRows(draft[field.id]);
    const displayName = art.swedishName || art.scientificName;
    const isSpeciesObservation = entryMode === 'species_observation';
    const isPresenceObservation = entryMode === 'presence_observation';
    const registrationMode = getEffectiveArtRegistrationMode(art, category, entryMode);
    const shouldCaptureCoordinate = shouldCaptureCoordinateForArt(entryMode, registrationMode);
    const shouldPromptPhoto = shouldPromptPhotoForAtlasArt(art);

    const coordinateGps = shouldCaptureCoordinate ? await refreshGps() : null;
    if (
      shouldCaptureCoordinate &&
      (!coordinateGps || typeof coordinateGps.latitude !== 'number' || typeof coordinateGps.longitude !== 'number')
    ) {
      showValidationToast(coordinateGps?.message || 'Kunde inte läsa GPS-position för artobservationen.');
      return;
    }

    updateDraftValue(field.id, [
      ...rows,
      {
        id: uuidv4(),
        artId: art.id,
        taxonId: art.taxonId,
        family: art.family,
        scientificName: art.scientificName,
        swedishName: art.swedishName,
        atlasPhotoRecommended: shouldPromptPhoto,
        zone: category ?? '',
        registrationMode,
        registrationCode: art.registrationCode,
        zoneLabel: getArtCategoryOption(field)?.label ?? '',
        latitude: coordinateGps && typeof coordinateGps.latitude === 'number' ? String(coordinateGps.latitude) : '',
        longitude: coordinateGps && typeof coordinateGps.longitude === 'number' ? String(coordinateGps.longitude) : '',
        altitude: coordinateGps && typeof coordinateGps.altitude === 'number' ? String(coordinateGps.altitude) : '',
        altitudeAccuracy:
          coordinateGps && typeof coordinateGps.altitudeAccuracy === 'number' ? String(coordinateGps.altitudeAccuracy) : '',
        accuracy: coordinateGps && typeof coordinateGps.accuracy === 'number' ? String(coordinateGps.accuracy) : '',
        coordinateCapturedAt: new Date().toISOString(),
        ...(isSpeciesObservation
          ? registrationMode === 'count'
            ? {antal: ''}
            : registrationMode === 'area'
              ? {m2: ''}
              : {finns: '1'}
          : registrationMode === 'bush'
            ? {langd: '', bredd: '', tathet: ''}
          : isPresenceObservation
            ? {finns: '1'}
          : {}),
        [nameColumn]: displayName,
      },
    ]);
    setArtSearchByField(prev => ({...prev, [field.id]: ''}));
    if (shouldPromptPhoto) {
      showAtlasPhotoPrompt(art);
    }
  }

  function updateArtRow(fieldId: string, rowId: string, column: string, value: string) {
    updateDraftValue(
      fieldId,
      getArtTableRows(draft[fieldId]).map(row => (row.id === rowId ? {...row, [column]: value} : row)),
    );
  }

  function updateNestedArtRow(parentFieldId: string, parentRowId: string, nestedFieldId: string, rowId: string, column: string, value: string) {
    updateDraftValue(
      parentFieldId,
      getRepeaterRows(draft[parentFieldId]).map(row =>
        row.id === parentRowId
          ? {
              ...row,
              [nestedFieldId]: getArtTableRows(row[nestedFieldId]).map(artRow =>
                artRow.id === rowId ? {...artRow, [column]: value} : artRow,
              ),
            }
          : row,
      ),
    );
  }

  function removeArtRow(fieldId: string, rowId: string) {
    updateDraftValue(
      fieldId,
      getArtTableRows(draft[fieldId]).filter(row => row.id !== rowId),
    );
  }

  function removeArtObservationPhoto(fieldId: string, rowId: string, photo: PhotoEntry) {
    Alert.alert('Ta bort bild', 'Vill du ta bort bilden från artobservationen och telefonens bildmapp?', [
      {text: 'Avbryt', style: 'cancel'},
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          deleteFileIfExists(photo.path).catch(() => undefined);
          updateDraftValue(
            fieldId,
            getArtTableRows(draft[fieldId]).map(row =>
              row.id === rowId ? {...row, foton: getPhotoArray(row.foton).filter(entry => entry.id !== photo.id)} : row,
            ),
          );
        },
      },
    ]);
  }

  function removeNestedArtObservationPhoto(parentFieldId: string, parentRowId: string, nestedFieldId: string, rowId: string, photo: PhotoEntry) {
    Alert.alert('Ta bort bild', 'Vill du ta bort bilden från artobservationen och telefonens bildmapp?', [
      {text: 'Avbryt', style: 'cancel'},
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: () => {
          deleteFileIfExists(photo.path).catch(() => undefined);
          updateDraftValue(
            parentFieldId,
            getRepeaterRows(draft[parentFieldId]).map(row =>
              row.id === parentRowId
                ? {
                    ...row,
                    [nestedFieldId]: getArtTableRows(row[nestedFieldId]).map(artRow =>
                      artRow.id === rowId
                        ? {...artRow, foton: getPhotoArray(artRow.foton).filter(entry => entry.id !== photo.id)}
                        : artRow,
                    ),
                  }
                : row,
            ),
          );
        },
      },
    ]);
  }

  function renderSpeciesObservationInput(fieldId: string, row: ArtTableRow, nested?: {parentField: BasicDataField; parentRow: RepeaterRow}) {
    const updateValue = (column: string, value: string) => {
      if (nested) {
        updateNestedArtRow(nested.parentField.id, nested.parentRow.id, fieldId, row.id, column, value);
      } else {
        updateArtRow(fieldId, row.id, column, value);
      }
    };

    if (row.registrationMode === 'count') {
      return (
        <View style={styles.artColumnInputGroup}>
          <Text style={styles.repeaterFieldLabel}>Antal</Text>
          <TextInput
            keyboardType="numeric"
            onChangeText={text => updateValue('antal', text)}
            placeholder="Antal"
            placeholderTextColor="#8e8579"
            style={styles.artValueInput}
            value={getStringValue(row.antal)}
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
            onChangeText={text => updateValue('m2', text)}
            placeholder="m2"
            placeholderTextColor="#8e8579"
            style={styles.artValueInput}
            value={getStringValue(row.m2)}
          />
        </View>
      );
    }

    if (row.registrationMode === 'bush') {
      return (
        <View style={styles.artColumnRowCompact}>
          {[
            {key: 'langd', label: 'Längd'},
            {key: 'bredd', label: 'Bredd'},
            {key: 'tathet', label: 'Täthet'},
          ].map(item => (
            <View key={item.key} style={styles.artColumnInputGroup}>
              <Text style={styles.repeaterFieldLabel}>{item.label}</Text>
              <TextInput
                keyboardType={item.key === 'tathet' ? 'default' : 'numeric'}
                onChangeText={text => updateValue(item.key, text)}
                placeholder={item.label}
                placeholderTextColor="#8e8579"
                style={styles.artValueInput}
                value={getStringValue(row[item.key])}
              />
            </View>
          ))}
        </View>
      );
    }

    const present = getStringValue(row.finns) !== '0';
    return (
      <Pressable
        accessibilityLabel="Arten finns"
        accessibilityRole="checkbox"
        onPress={() => updateValue('finns', present ? '0' : '1')}
        style={styles.presenceToggle}>
        <View style={[styles.presenceCheckbox, present && styles.presenceCheckboxChecked]} />
        <Text style={styles.presenceToggleText}>Finns</Text>
      </Pressable>
    );
  }

  function renderArtObservationExtras(field: BasicDataField, row: ArtTableRow, nested?: {parentField: BasicDataField; parentRow: RepeaterRow}) {
    const photos = getPhotoArray(row.foton);
    const label = getStringValue(row.swedishName) || getStringValue(row.scientificName) || 'Artobservation';
    return (
      <View style={styles.artObservationExtras}>
        <View style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>Kommentar</Text>
          <TextInput
            multiline
            onChangeText={text => {
              if (nested) {
                updateNestedArtRow(nested.parentField.id, nested.parentRow.id, field.id, row.id, 'kommentar', text);
              } else {
                updateArtRow(field.id, row.id, 'kommentar', text);
              }
            }}
            placeholder="Kommentar"
            placeholderTextColor="#8e8579"
            style={[styles.input, styles.artCommentInput]}
            value={getStringValue(row.kommentar)}
          />
        </View>
        <View style={styles.repeaterNestedBlock}>
          <Text style={styles.repeaterFieldLabel}>Foton</Text>
          {photos.length === 0 ? <Text style={styles.fieldHelp}>Inga bilder tillagda.</Text> : null}
          {photos.map(photo =>
            renderPhotoPreview(
              photo,
              () =>
                nested
                  ? removeNestedArtObservationPhoto(nested.parentField.id, nested.parentRow.id, field.id, row.id, photo)
                  : removeArtObservationPhoto(field.id, row.id, photo),
              label,
            ),
          )}
          <Pressable
            onPress={() =>
              openPhotoCapture(
                nested
                  ? {
                      fieldId: nested.parentField.id,
                      mode: 'nestedArtObservationPhoto',
                      category: 'arter',
                      label: `Ta bild: ${label}`,
                      parentRowId: nested.parentRow.id,
                      nestedFieldId: field.id,
                      observationId: row.id,
                      typeValue: `${getStringValue(row.artId) || 'art'}_${row.id}`,
                      typeLabel: label,
                    }
                  : {
                      fieldId: field.id,
                      mode: 'artObservationPhoto',
                      category: 'arter',
                      label: `Ta bild: ${label}`,
                      observationId: row.id,
                      typeValue: `${getStringValue(row.artId) || 'art'}_${row.id}`,
                      typeLabel: label,
                    },
              ).catch(() => undefined)
            }
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Lägg till bild</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderArtTableField(field: BasicDataField) {
    const categoryOption = getArtCategoryOption(field);
    const category = categoryOption?.value ?? (typeof field.category === 'string' ? field.category : null);
    const entryMode = categoryOption?.entry_mode;
    const isSpeciesObservation = entryMode === 'species_observation';
    const isPresenceObservation = entryMode === 'presence_observation';
    const isObservation = isSpeciesObservation || isPresenceObservation;
    const columns = getArtTableColumns(field, categoryOption);
    const nameColumn = getArtNameColumn(columns);
    const rows = getArtTableRows(draft[field.id]);
    const visibleRows = isSpeciesObservation && category ? rows.filter(row => getStringValue(row.zone) === category) : rows;
    const artRows = getArtOptionsForField(field, category);
    const query = artSearchByField[field.id]?.trim().toLowerCase() ?? '';
    const filteredArtRows = artRows
      .filter(art => {
        if (!query) {
          return true;
        }

        return [art.family, art.scientificName, art.swedishName, art.taxonId].some(value =>
          value.toLowerCase().includes(query),
        );
      })
      .slice(0, 60);

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {!category ? (
          <Text style={styles.fieldHelp}>{isSpeciesObservation ? 'Välj zon först.' : 'Välj artkategori först.'}</Text>
        ) : (
          <>
            <Text style={styles.fieldHelp}>
              {categoryOption?.label ?? field.label}: sök fram en art och lägg till den.
              {isSpeciesObservation ? ' GPS-koordinat sparas på observationen.' : ''}
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
                    onPress={() => {
                      void addArtRow(field, art, columns, category, entryMode);
                    }}
                    style={styles.artSearchItem}>
                    <Text style={styles.artSearchName}>{art.swedishName || art.scientificName}</Text>
                    <Text style={styles.artSearchMeta}>
                      {art.scientificName} | {art.family}
                      {isPresenceObservation
                        ? ' | Finns'
                        : isSpeciesObservation
                          ? ` | ${
                              getEffectiveArtRegistrationMode(art, category, entryMode) === 'count'
                                ? 'Antal'
                                : getEffectiveArtRegistrationMode(art, category, entryMode) === 'area'
                                  ? 'm2'
                                  : getEffectiveArtRegistrationMode(art, category, entryMode) === 'bush'
                                    ? 'Längd/bredd/täthet'
                                    : 'Finns'
                            }`
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

        {visibleRows.length > 0 ? (
          <View style={styles.artTableList}>
            {visibleRows.map(row => (
              <View key={row.id} style={styles.artTableRowCard}>
                <View style={styles.repeaterRowHeader}>
                  <View style={styles.photoPreviewMeta}>
                    <Text style={styles.repeaterRowTitle}>
                      {getStringValue(row[nameColumn]) || getStringValue(row.swedishName) || getStringValue(row.scientificName)}
                    </Text>
                    <Text style={styles.artSearchMeta}>
                      {[getStringValue(row.scientificName), getStringValue(row.zoneLabel)].filter(Boolean).join(' | ')}
                    </Text>
                    {row.atlasPhotoRecommended ? (
                      <Text style={styles.atlasPhotoHint}>Foto rekommenderas: arten saknas i atlaslistan för aktuell ruta.</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => removeArtRow(field.id, row.id)} style={styles.smallDangerButton}>
                    <Text style={styles.smallDangerButtonText}>Ta bort</Text>
                  </Pressable>
                </View>
                {isObservation ? (
                  <View style={styles.artColumnRowCompact}>{renderSpeciesObservationInput(field.id, row)}</View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.artColumnRow}>
                      {columns
                        .filter(column => column !== nameColumn)
                        .map(column => (
                          <View key={`${row.id}-${column}`} style={styles.artColumnInputGroup}>
                            <Text style={styles.repeaterFieldLabel}>{formatConfigLabel(column)}</Text>
                            <TextInput
                              onChangeText={text => updateArtRow(field.id, row.id, column, text)}
                              placeholder="Värde"
                              placeholderTextColor="#8e8579"
                              style={styles.artValueInput}
                              value={getStringValue(row[column])}
                            />
                          </View>
                        ))}
                    </View>
                  </ScrollView>
                )}
                {isObservation ? renderArtObservationExtras(field, row) : null}
                {isSpeciesObservation ? (
                  <Text style={styles.artCoordinateText}>
                    Koordinat:{' '}
                    {row.latitude && row.longitude ? `${getStringValue(row.latitude)}, ${getStringValue(row.longitude)}` : 'saknas'}
                    {row.altitude ? ` | höjd ${Number(row.altitude).toFixed(2)} m` : ''}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.fieldHelp}>Inga arter tillagda ännu.</Text>
        )}
      </View>
    );
  }

  async function addNestedArtRow(
    parentField: BasicDataField,
    parentRow: RepeaterRow,
    field: BasicDataField,
    art: ArtResourceRow,
    columns: string[],
    category: string,
    entryMode?: string,
  ) {
    const nameColumn = getArtNameColumn(columns);
    const displayName = art.swedishName || art.scientificName;
    const registrationMode = getEffectiveArtRegistrationMode(art, category, entryMode);
    const shouldCaptureCoordinate = shouldCaptureCoordinateForArt(entryMode, registrationMode);
    const coordinateGps = shouldCaptureCoordinate ? await refreshGps() : gps;
    const shouldPromptPhoto = shouldPromptPhotoForAtlasArt(art);

    if (
      shouldCaptureCoordinate &&
      (typeof coordinateGps.latitude !== 'number' || typeof coordinateGps.longitude !== 'number')
    ) {
      showValidationToast(coordinateGps.message || 'Kunde inte läsa GPS-position för artobservationen.');
      return;
    }

    const nextArtRow: ArtTableRow = {
      id: uuidv4(),
      artId: art.id,
      taxonId: art.taxonId,
      family: art.family,
      scientificName: art.scientificName,
      swedishName: art.swedishName,
      atlasPhotoRecommended: shouldPromptPhoto,
      zone: category,
      registrationMode,
      registrationCode: art.registrationCode,
      zoneLabel: getArtCategoryOption(field)?.label ?? '',
      latitude: typeof coordinateGps.latitude === 'number' ? String(coordinateGps.latitude) : '',
      longitude: typeof coordinateGps.longitude === 'number' ? String(coordinateGps.longitude) : '',
      altitude: typeof coordinateGps.altitude === 'number' ? String(coordinateGps.altitude) : '',
      altitudeAccuracy: typeof coordinateGps.altitudeAccuracy === 'number' ? String(coordinateGps.altitudeAccuracy) : '',
      accuracy: typeof coordinateGps.accuracy === 'number' ? String(coordinateGps.accuracy) : '',
      coordinateCapturedAt: new Date().toISOString(),
      ...(entryMode === 'species_observation'
        ? registrationMode === 'count'
          ? {antal: ''}
          : registrationMode === 'area'
            ? {m2: ''}
            : {finns: '1'}
        : registrationMode === 'bush'
          ? {langd: '', bredd: '', tathet: ''}
        : {}),
      [nameColumn]: displayName,
    };

    updateDraftValue(
      parentField.id,
      getRepeaterRows(draft[parentField.id]).map(row =>
        row.id === parentRow.id
          ? {
              ...row,
              [field.id]: [...getArtTableRows(row[field.id]), nextArtRow],
            }
          : row,
      ),
    );
    setArtSearchByField(prev => ({...prev, [`${parentField.id}:${parentRow.id}:${field.id}`]: ''}));
    if (shouldPromptPhoto) {
      showAtlasPhotoPrompt(art);
    }
  }

  function removeNestedArtRow(parentFieldId: string, parentRowId: string, nestedFieldId: string, rowId: string) {
    updateDraftValue(
      parentFieldId,
      getRepeaterRows(draft[parentFieldId]).map(row =>
        row.id === parentRowId
          ? {
              ...row,
              [nestedFieldId]: getArtTableRows(row[nestedFieldId]).filter(artRow => artRow.id !== rowId),
            }
          : row,
      ),
    );
  }

  function renderNestedArtTableField(parentField: BasicDataField, parentRow: RepeaterRow, field: BasicDataField) {
    const categoryOption = getArtCategoryOption(field);
    const category = categoryOption?.value ?? (typeof field.category === 'string' ? field.category : null);
    const entryMode = categoryOption?.entry_mode;
    const columns = getArtTableColumns(field, categoryOption);
    const nameColumn = getArtNameColumn(columns);
    const rows = getArtTableRows(parentRow[field.id]);
    const searchKey = `${parentField.id}:${parentRow.id}:${field.id}`;
    const artRows = getArtOptionsForField(field, category);
    const query = artSearchByField[searchKey]?.trim().toLowerCase() ?? '';
    const filteredArtRows = artRows
      .filter(art => {
        if (!query) {
          return true;
        }

        return [art.family, art.scientificName, art.swedishName, art.taxonId].some(value =>
          value.toLowerCase().includes(query),
        );
      })
      .slice(0, 60);

    return (
      <View key={field.id} style={styles.repeaterNestedBlock}>
        <Text style={styles.repeaterFieldLabel}>{field.label}</Text>
        {!category ? (
          <Text style={styles.fieldHelp}>Artkategori saknas.</Text>
        ) : (
          <>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={text => setArtSearchByField(prev => ({...prev, [searchKey]: text}))}
              placeholder="Sök art"
              placeholderTextColor="#8e8579"
              style={styles.input}
              value={artSearchByField[searchKey] ?? ''}
            />
            <View style={styles.artSearchList}>
              {filteredArtRows.length > 0 ? (
                filteredArtRows.map(art => (
                  <Pressable
                    key={art.id}
                    onPress={() => {
                      if (category) {
                        void addNestedArtRow(parentField, parentRow, field, art, columns, category, entryMode);
                      }
                    }}
                    style={styles.artSearchItem}>
                    <Text style={styles.artSearchName}>{art.swedishName || art.scientificName}</Text>
                    <Text style={styles.artSearchMeta}>
                      {art.scientificName} | {art.family}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.fieldHelp}>Inga arter hittades i lokal artlista.</Text>
              )}
            </View>
          </>
        )}
        {rows.length === 0 ? <Text style={styles.fieldHelp}>Inga arter tillagda på raden ännu.</Text> : null}
        {rows.map(row => (
          <View key={row.id} style={styles.artTableRowCard}>
            <View style={styles.repeaterRowHeader}>
              <View style={styles.photoPreviewMeta}>
                <Text style={styles.repeaterRowTitle}>
                  {getStringValue(row[nameColumn]) || getStringValue(row.swedishName) || getStringValue(row.scientificName)}
                </Text>
                <Text style={styles.artSearchMeta}>
                  {[getStringValue(row.scientificName), getStringValue(row.zoneLabel)].filter(Boolean).join(' | ')}
                </Text>
                {row.atlasPhotoRecommended ? (
                  <Text style={styles.atlasPhotoHint}>Foto rekommenderas: arten saknas i atlaslistan för aktuell ruta.</Text>
                ) : null}
              </View>
              <Pressable onPress={() => removeNestedArtRow(parentField.id, parentRow.id, field.id, row.id)} style={styles.smallDangerButton}>
                <Text style={styles.smallDangerButtonText}>Ta bort</Text>
              </Pressable>
            </View>
            {entryMode === 'species_observation'
              ? renderSpeciesObservationInput(field.id, row, {parentField, parentRow})
              : null}
            {renderArtObservationExtras(field, row, {parentField, parentRow})}
            <Text style={styles.artCoordinateText}>
              Koordinat: {row.latitude && row.longitude ? `${getStringValue(row.latitude)}, ${getStringValue(row.longitude)}` : 'saknas'}
              {row.altitude ? ` | höjd ${Number(row.altitude).toFixed(2)} m` : ''}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  function renderInventoryUuidField(field: BasicDataField) {
    const role = draft.inventering_roll;
    const inventerareCount = draft.antal_inventerare;
    const sessionUuid = typeof draft.inventering_uuid === 'string' ? draft.inventering_uuid : '';
    const hasValidUuid = isValidUuid(sessionUuid);
    const qrPayload = hasValidUuid ? createSessionQrPayload(sessionUuid, draft) : null;

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
                  Hjälparna skannar koden så att UUID, ruta, provyta, startpunkt och slutpunkt följer med.
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.fieldHelp}>
              Skanna master-koden för att hämta UUID, ruta, provyta, startpunkt och slutpunkt.
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
            <Text style={styles.valueText}>{formatGpsPoint(value)}</Text>
            <Pressable
              onPress={async () => {
                const nextGps = await refreshGps();
                saveGpsCapture(field, nextGps);
              }}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sätt {field.label.toLowerCase()}</Text>
            </Pressable>
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
        return renderRepeaterField(field, field.id !== 'deponi_rows');
      case 'matrix_percent':
        return renderMatrixPercentField(field);
      case 'resource_picker':
        return renderResourcePickerField(field);
      case 'art_table':
        return renderArtTableField(field);
      case 'transect_zone_map':
        return renderTransectZoneMapField(field);
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

  function renderPlotSelectionMap() {
    const rows = datasets.provyteunderlag ?? [];
    const visibleRows = rows.filter(row => {
      const latitude = parseNumber(row.latitud);
      const longitude = parseNumber(row.longitud);
      return latitude != null && longitude != null && isValidCoordinate(latitude, longitude);
    });
    const userCoordinate =
      typeof gps.latitude === 'number' &&
      typeof gps.longitude === 'number' &&
      isValidCoordinate(gps.latitude, gps.longitude)
        ? {latitude: gps.latitude, longitude: gps.longitude}
        : null;

    if (visibleRows.length === 0) {
      return (
        <View style={styles.mapEmptyState}>
          <Text style={styles.fieldHelp}>Inga provytor med koordinater hittades i data.csv.</Text>
        </View>
      );
    }

    const leafletHtml = createPlotSelectionLeafletHtml({
      points: visibleRows.map(row => {
        const latitude = parseNumber(row.latitud) ?? 0;
        const longitude = parseNumber(row.longitud) ?? 0;
        const selected = row.ruta === ruta && row.provyta === provyta;

        return {
          latitude,
          longitude,
          selected,
          row,
          title: `Ruta ${row.ruta}, provyta ${row.provyta}`,
        };
      }),
      userCoordinate,
    });

    return (
      <View style={styles.plotSelectionMapWrap}>
        <WebView
          key={`plot-map-${visibleRows.length}-${ruta}-${provyta}-${gps.latitude ?? ''}-${gps.longitude ?? ''}`}
          javaScriptEnabled
          nestedScrollEnabled
          onMessage={handlePlotSelectionMapMessage}
          originWhitelist={['*']}
          source={{html: leafletHtml}}
          style={styles.transectMap}
        />
      </View>
    );
  }

  function renderZoneBoundaryPreview(field: BasicDataField, value: string) {
    const geometry = getTransectGeometry();
    if (!geometry) {
      return null;
    }

    const userCoordinate =
      gps.latitude != null && gps.longitude != null && isValidCoordinate(gps.latitude, gps.longitude)
        ? {latitude: gps.latitude, longitude: gps.longitude}
        : null;
    const savedValue = draft[field.id];
    const savedMeters = parseNumber(savedValue);
    const editingMeters = parseNumber(value);
    const hasChangedValue = editingMeters != null && (savedMeters == null || Math.abs(savedMeters - editingMeters) > 0.001);
    const preliminaryZone = hasChangedValue ? getPreliminaryZone(field, value) : null;
    const zones = buildTransectZones(draft).filter(zone => !preliminaryZone || zone.id !== field.id);
    const leafletHtml = createTransectLeafletHtml({
      startCoordinate: geometry.startCoordinate,
      endCoordinate: geometry.endCoordinate,
      userCoordinate,
      zones,
      preliminaryZone,
      forceDetail: true,
      fitPadding: 0.02,
      fitMaxZoom: 19,
      includeUserInBounds: false,
      initialLayer: transectMapLayerRef.current,
      ruta,
      provyta,
    });

    return (
      <View style={styles.zonePreviewBlock}>
        <View style={styles.zonePreviewMapWrap}>
          <WebView
            key={getZoneMapKey(`preview-${field.id}`, zones, preliminaryZone)}
            javaScriptEnabled
            nestedScrollEnabled
            onMessage={handleTransectMapMessage}
            originWhitelist={['*']}
            source={{html: leafletHtml}}
            style={styles.transectMap}
          />
        </View>
        {renderZoneLegend(zones, preliminaryZone)}
        <Text style={styles.fieldHelp}>
          GPS räknar slutlängd som meter från startpunkten längs transektens mittlinje.
        </Text>
      </View>
    );
  }

  function renderTransectZoneMapField(field: BasicDataField) {
    const geometry = getTransectGeometry();
    const referenceGeometry = getReferenceTransectGeometry();

    if (!geometry && !referenceGeometry) {
      return (
        <View key={field.id} style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <Text style={styles.fieldHelp}>Välj provyta och sätt Startpunkt/Slutpunkt för att visa transekten.</Text>
        </View>
      );
    }

    const userCoordinate =
      gps.latitude != null && gps.longitude != null && isValidCoordinate(gps.latitude, gps.longitude)
        ? {latitude: gps.latitude, longitude: gps.longitude}
        : null;
    const zones = geometry ? buildTransectZones() : [];
    const leafletHtml = createTransectLeafletHtml({
      startCoordinate: geometry?.startCoordinate ?? null,
      endCoordinate: geometry?.endCoordinate ?? null,
      referenceStartCoordinate: referenceGeometry?.startCoordinate ?? null,
      referenceEndCoordinate: referenceGeometry?.endCoordinate ?? null,
      userCoordinate,
      zones,
      preliminaryZone: null,
      forceDetail: true,
      fitPadding: 0.12,
      fitMaxZoom: 19,
      includeUserInBounds: false,
      initialLayer: transectMapLayerRef.current,
      ruta,
      provyta,
    });

    return (
      <View key={field.id} style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <View style={styles.zoneMapWrap}>
          <WebView
            key={getZoneMapKey('zone-map', zones)}
            javaScriptEnabled
            nestedScrollEnabled
            onMessage={handleTransectMapMessage}
            originWhitelist={['*']}
            source={{html: leafletHtml}}
            style={styles.transectMap}
          />
        </View>
        {renderZoneLegend(zones)}
      </View>
    );
  }

  function renderTransectMap() {
    const geometry = getTransectGeometry();
    const referenceGeometry = getReferenceTransectGeometry();

    if (!geometry && !referenceGeometry) {
      return (
        <View style={styles.mapEmptyState}>
          <Text style={styles.fieldHelp}>Välj en provyta med koordinater, transektlängd och transektriktning först.</Text>
        </View>
      );
    }

    const userCoordinate =
      gps.latitude != null && gps.longitude != null && isValidCoordinate(gps.latitude, gps.longitude)
        ? {latitude: gps.latitude, longitude: gps.longitude}
        : null;
    const zones = geometry ? buildTransectZones() : [];
    const leafletHtml = createTransectLeafletHtml({
      startCoordinate: geometry?.startCoordinate ?? null,
      endCoordinate: geometry?.endCoordinate ?? null,
      referenceStartCoordinate: referenceGeometry?.startCoordinate ?? null,
      referenceEndCoordinate: referenceGeometry?.endCoordinate ?? null,
      userCoordinate,
      zones,
      preliminaryZone: null,
      initialLayer: transectMapLayerRef.current,
      ruta,
      provyta,
    });

    return (
      <View style={styles.transectMapPanel}>
        <View style={styles.mapCanvasWrap}>
          <WebView
            key={getZoneMapKey('header-map', zones)}
            javaScriptEnabled
            nestedScrollEnabled
            onMessage={handleTransectMapMessage}
            originWhitelist={['*']}
            source={{html: leafletHtml}}
            style={styles.transectMap}
          />
        </View>

        {renderZoneLegend(zones)}

        <View style={styles.mapMetaGrid}>
          <Text style={styles.modalLine}>
            Gul ram: uppmätt transekt. Blå streckad ram: teoretisk transekt från provyteunderlag.
          </Text>
          <Text style={styles.modalLine}>Ruta: {ruta || '-'}</Text>
          <Text style={styles.modalLine}>Provyta: {provyta || '-'}</Text>
          <Text style={styles.modalLine}>
            Uppmätt längd: {geometry ? `${geometry.lengthMeters.toFixed(1)} m` : 'Startpunkt och Slutpunkt saknas'}
          </Text>
          <Text style={styles.modalLine}>
            Uppmätt riktning: {geometry ? `${geometry.bearingDegrees.toFixed(1)} grader` : '-'}
          </Text>
          <Text style={styles.modalLine}>
            Teoretisk längd: {referenceGeometry ? `${referenceGeometry.lengthMeters} m` : '-'}
          </Text>
          <Text style={styles.modalLine}>
            Start: {geometry ? `${geometry.startLat.toFixed(6)}, ${geometry.startLon.toFixed(6)}` : '-'}
          </Text>
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
    ? basicData.tabs
        .filter(
          tab =>
            !hiddenMainTabIds.has(tab.id) &&
            (!HEADER_MENU_TAB_IDS.has(tab.id) || (tab.id === 'ej_inventerad' && draft.inventeringstyp === 'ej_inventerad')),
        )
        .sort((left, right) => Number(SIDE_TAB_LAST_IDS.has(left.id)) - Number(SIDE_TAB_LAST_IDS.has(right.id)))
    : basicData.tabs.filter(tab => tab.id === 'oversikt');
  const visibleActiveTab = hasSelectedPlot
    ? hiddenMainTabIds.has(activeTab.id)
      ? basicData.tabs.find(tab => tab.id === DISTANCE_INVENTORY_TAB_ID) ?? activeTab
      : activeTab
    : overviewTab;
  const shouldShowSideTabs = hasSelectedPlot && visibleActiveTab.id !== overviewTab.id;
  const activeTabTitle = visibleActiveTab.id === 'substrat' ? 'Substratmatris' : visibleActiveTab.label;
  const unreadServerMessageCount = serverMessages.filter(message => !message.read).length;
  const blalappPhoto = getBlalappPhoto();
  const tabContent = (
    <View style={styles.tabContainer}>
      <Text style={styles.tabTitle}>{activeTabTitle}</Text>
      {visibleActiveTab.id === 'habitat' ? renderOldHabitatDataCard() : null}
      {visibleActiveTab.sections.map(section => {
        const sectionFields = section.fields.map(fieldOrId => {
            const field = resolveField(fieldOrId);
            if (
              !field ||
              USER_SETUP_FIELD_IDS.has(field.id) ||
              (!hasSelectedPlot && REQUIRES_SELECTED_PLOT_FIELD_IDS.has(field.id))
            ) {
              return null;
            }
            return renderField(field);
          });

        if (visibleActiveTab.id === 'substrat' && section.id === 'substratmatris') {
          return <View key={section.id}>{sectionFields}</View>;
        }

        return (
          <View key={section.id} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.label}</Text>
            {sectionFields}
            {section.id === 'provyta_val' ? (
            <>
              {renderPlotMapButton()}
              {renderInventoryActionCard()}
            </>
            ) : null}
          </View>
        );
      })}
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
            Du är {transectDistanceMeters.toFixed(0)} m från den teoretiska transektens linje.
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          keyboardInset > 0 && {paddingBottom: keyboardInset + 96},
          shouldShowSideTabs && styles.inventoryContentContainer,
        ]}
        keyboardShouldPersistTaps="handled">
        {shouldShowSideTabs ? (
          <View style={styles.inventoryLayout}>
            <View style={styles.sideTabRail}>
              {visibleTabs.map(tab => {
                const selected = tab.id === visibleActiveTab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => handleSelectTab(tab.id)}
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
                    onPress={() => handleSelectTab(tab.id)}
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
                {renderOldStrandtypDialogInfo(editingField.field)}
                {editingField.field.type === 'select' || editingField.field.type === 'boolean_select' ? (
                  <ScrollView nestedScrollEnabled style={styles.dialogOptionScroll} contentContainerStyle={styles.dialogOptionList}>
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
                  </ScrollView>
                ) : (
                  <>
                    {isZoneBoundaryField(editingField.field)
                      ? renderZoneBoundaryPreview(editingField.field, editingField.value)
                      : null}
                    <View style={styles.dialogInputRow}>
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
                          styles.dialogInput,
                          editingField.field.type === 'multiline_text' && styles.multilineInput,
                        ]}
                        value={editingField.value}
                      />
                      {isZoneBoundaryField(editingField.field) ? (
                        <Pressable
                          accessibilityLabel={`Sätt ${editingField.field.label} med GPS`}
                          accessibilityRole="button"
                          onPress={() => {
                            setZoneBoundaryFromGps(editingField.field).catch(error => {
                              showValidationToast(error instanceof Error ? error.message : 'Kunde inte läsa GPS-position.');
                            });
                          }}
                          style={styles.dialogGpsButton}>
                          <Text style={styles.dialogGpsButtonText}>GPS</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </>
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
            <Text style={styles.modalLine}>Höjd: {typeof gps.altitude === 'number' ? `${gps.altitude.toFixed(2)} m` : '-'}</Text>
            <Text style={styles.modalLine}>
              Höjdnoggrannhet:{' '}
              {typeof gps.altitudeAccuracy === 'number' ? `${gps.altitudeAccuracy.toFixed(2)} m` : '-'}
            </Text>
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

          <View style={styles.mapContent}>
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
          </View>
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
            <Pressable onPress={startNewInventory} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Starta ny inventering</Text>
            </Pressable>
            {inventories.length === 0 ? (
              <View style={styles.mapEmptyState}>
                <Text style={styles.fieldHelp}>Inga lokala inventeringar ännu.</Text>
              </View>
            ) : (
              inventories.map(item => (
                <Pressable key={item.id} onPress={() => openInventory(item).catch(() => undefined)} style={styles.inventoryListItem}>
                  <View style={styles.photoPreviewMeta}>
                    <Text style={styles.inventoryListTitle}>Ruta {item.ruta} · Provyta {item.provyta}</Text>
                    <Text style={styles.inventoryListMeta}>Filbas: {item.id}</Text>
                    <Text style={styles.inventoryListMeta}>
                      Status: {item.status} · Uppdaterad {new Date(item.updatedAt).toLocaleString('sv-SE')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={event => {
                      event.stopPropagation();
                      openInventory(item).catch(() => undefined);
                    }}
                    style={styles.smallSecondaryButton}>
                    <Text style={styles.smallSecondaryButtonText}>Öppna</Text>
                  </Pressable>
                  <Pressable
                    onPress={event => {
                      event.stopPropagation();
                      Alert.alert(
                        'Radera inventering?',
                        'All data, JSON-export och alla foton för inventeringen raderas från telefonen.',
                        [
                          {text: 'Avbryt', style: 'cancel'},
                          {text: 'Ja', style: 'destructive', onPress: () => openDeleteInventory(item)},
                        ],
                      );
                    }}
                    style={styles.smallDangerButton}>
                    <Text style={styles.smallDangerButtonText}>Radera</Text>
                  </Pressable>
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowMessagesModal(false)} visible={showMessagesModal}>
        <SafeAreaView style={styles.mapScreen}>
          <View style={styles.mapHeader}>
            <View style={styles.photoPreviewMeta}>
              <Text style={styles.modalTitle}>Meddelande</Text>
              <Text style={styles.fieldHelp}>Textfiler från serverns messages-mapp.</Text>
            </View>
            <Pressable
              accessibilityLabel="Stäng meddelanden"
              onPress={() => setShowMessagesModal(false)}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.inventoryListContent}>
            <Pressable
              onPress={() => refreshServerMessages(false).catch(() => undefined)}
              style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Uppdatera meddelanden</Text>
            </Pressable>
            {serverMessages.length === 0 ? (
              <View style={styles.mapEmptyState}>
                <Text style={styles.fieldHelp}>Inga meddelanden hittades på servern.</Text>
              </View>
            ) : (
              serverMessages.map(message => (
                <Pressable
                  key={message.key}
                  onPress={() => {
                    Alert.alert(message.fileName, message.text || 'Tomt meddelande.', [
                      {
                        text: 'OK',
                        onPress: () => {
                          markServerMessageRead(message).catch(() => undefined);
                        },
                      },
                    ]);
                  }}
                  style={[styles.inventoryListItem, !message.read && styles.messageUnreadItem]}>
                  <View style={styles.photoPreviewMeta}>
                    <Text style={styles.inventoryListTitle}>
                      {message.read ? '' : 'Ny: '}
                      {message.fileName}
                    </Text>
                    <Text style={styles.inventoryListMeta}>
                      {message.modifiedAt ? new Date(message.modifiedAt).toLocaleString('sv-SE') : 'Okänd tid'} ·{' '}
                      {Math.round(message.size)} byte
                    </Text>
                    <Text numberOfLines={4} style={styles.photoPreviewText}>
                      {message.text || 'Tomt meddelande.'}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowExportPreviewModal(false)} visible={showExportPreviewModal}>
        <SafeAreaView style={styles.mapScreen}>
          <View style={styles.mapHeader}>
            <View style={styles.photoPreviewMeta}>
              <Text style={styles.modalTitle}>Aktuell exportfil</Text>
              <Text style={styles.fieldHelp}>Dev-vy av JSON som skulle skrivas vid export.</Text>
            </View>
            <Pressable
              accessibilityLabel="Stäng exportfil"
              onPress={() => setShowExportPreviewModal(false)}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <View style={styles.exportPreviewContent}>
            {currentExportPreview ? (
              <>
                <Text style={styles.modalLine}>Fil: {currentExportPreview.fileName}</Text>
                <Text style={styles.modalLine}>Sökväg vid export: {currentExportPreview.path}</Text>
                <ScrollView
                  nestedScrollEnabled
                  contentContainerStyle={styles.exportPreviewScrollContent}
                  style={styles.exportPreviewScroll}>
                  <Text selectable style={styles.exportPreviewText}>
                    {currentExportPreview.json}
                  </Text>
                </ScrollView>
              </>
            ) : (
              <Text style={styles.fieldHelp}>Basic data är inte inläst ännu.</Text>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowBlalappModal(false)} visible={showBlalappModal}>
        <SafeAreaView style={styles.mapScreen}>
          <View style={styles.mapHeader}>
            <View style={styles.photoPreviewMeta}>
              <Text style={styles.modalTitle}>Blålapp</Text>
              <Text style={styles.fieldHelp}>Fri text kopplad till aktuell ruta/provyta.</Text>
            </View>
            <Pressable
              accessibilityLabel="Stäng blålapp"
              onPress={() => setShowBlalappModal(false)}
              style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.inventoryListContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Text</Text>
            <TextInput
              maxLength={BLALAPP_MAX_LENGTH}
              multiline
              onChangeText={text => setBlalappInput(text.slice(0, BLALAPP_MAX_LENGTH))}
              placeholder="Skriv blålapp..."
              placeholderTextColor="#8e8579"
              style={[styles.input, styles.blalappInput]}
              value={blalappInput}
            />
            <Text style={styles.fieldHelp}>
              {blalappInput.length}/{BLALAPP_MAX_LENGTH} tecken
            </Text>

            <Text style={styles.fieldLabel}>Foto</Text>
            {blalappPhoto
              ? renderPhotoPreview(blalappPhoto, () => removePhoto(BLALAPP_PHOTO_FIELD_ID, blalappPhoto), 'Blålapp')
              : <Text style={styles.fieldHelp}>Inget foto tillagt.</Text>}
            <Pressable onPress={takeBlalappPhoto} style={blalappPhoto ? styles.secondaryButton : styles.primaryButton}>
              <Text style={blalappPhoto ? styles.secondaryButtonText : styles.primaryButtonText}>
                {blalappPhoto ? 'Ta om foto' : 'Ta foto'}
              </Text>
            </Pressable>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowBlalappModal(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Avbryt</Text>
              </Pressable>
              <Pressable onPress={saveBlalapp} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Spara</Text>
              </Pressable>
            </View>
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
                <Pressable
                  onPress={() => {
                    setShowNavigationMenu(false);
                    setShowMessagesModal(true);
                    refreshServerMessages(false).catch(() => undefined);
                  }}
                  style={styles.menuItem}>
                  <Text style={styles.menuItemText}>
                    Meddelande{unreadServerMessageCount > 0 ? ` (${unreadServerMessageCount} nya)` : ''}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowNavigationMenu(false);
                    setShowExportPreviewModal(true);
                  }}
                  style={styles.menuItem}>
                  <Text style={styles.menuItemText}>Visa aktuell exportfil</Text>
                </Pressable>
              </View>

              <Text style={styles.menuSectionTitle}>Övrigt</Text>
              <View style={styles.menuList}>
                <Pressable
                  disabled={!hasSelectedPlot}
                  onPress={() => {
                    if (!hasSelectedPlot) {
                      return;
                    }
                    setShowNavigationMenu(false);
                    openBlalappModal();
                  }}
                  style={[styles.menuItem, !hasSelectedPlot && styles.menuItemDisabled]}>
                  <Text style={styles.menuItemText}>Blålapp</Text>
                </Pressable>
                {menuTabs.length > 0 ? (
                  menuTabs.map(tab => {
                    const selected = tab.id === activeTab.id;
                    return (
                      <Pressable
                        key={tab.id}
                        onPress={() => {
                          if (canLeaveStartImagesTab(tab.id)) {
                            setActiveTabId(tab.id);
                            setShowNavigationMenu(false);
                          }
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
              Bilden sparas i appens Strand-mapp och kopplas till aktuell provyta.
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
  inventoryContentContainer: {
    paddingLeft: 0,
    paddingRight: 10,
    paddingTop: 10,
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
    gap: 4,
  },
  sideTabRail: {
    backgroundColor: '#d8d4cb',
    borderColor: '#c9beb0',
    borderBottomRightRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    width: 70,
  },
  sideTab: {
    alignItems: 'center',
    borderBottomColor: '#c2b8aa',
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  sideTabSelected: {
    backgroundColor: '#d7e5e0',
  },
  sideTabText: {
    color: '#26231f',
    fontSize: 10,
    lineHeight: 12,
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
  matrixFieldCard: {
    paddingHorizontal: 8,
    paddingVertical: 10,
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
  promptGpsButton: {
    alignItems: 'center',
    backgroundColor: '#213127',
    borderRadius: 8,
    justifyContent: 'center',
    marginLeft: 8,
    minHeight: 38,
    paddingHorizontal: 10,
  },
  promptGpsButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
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
  oldInventoryInfoCard: {
    backgroundColor: '#eef6ee',
    borderColor: '#a9c9b2',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  oldInventoryInfoTitle: {
    color: '#165d3c',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  oldInventoryInfoText: {
    color: '#213127',
    fontSize: 13,
    lineHeight: 19,
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
  artCommentInput: {
    minHeight: 58,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  blalappInput: {
    minHeight: 180,
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
  atlasPhotoHint: {
    color: '#8a5b12',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 4,
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
  smallSecondaryButton: {
    backgroundColor: '#eef6ee',
    borderColor: '#b7ccb9',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallSecondaryButtonText: {
    color: '#24543a',
    fontSize: 12,
    fontWeight: '800',
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
  repeaterListbox: {
    backgroundColor: '#fffaf2',
    borderColor: '#d8ccbc',
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 240,
  },
  repeaterListboxItem: {
    borderBottomColor: '#eadfce',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  repeaterListboxItemSelected: {
    backgroundColor: '#165d3c',
  },
  repeaterListboxText: {
    color: '#24352a',
    fontSize: 14,
    fontWeight: '600',
  },
  repeaterListboxTextSelected: {
    color: '#ffffff',
  },
  repeaterListboxEmptyText: {
    color: '#6c6257',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  matrixTable: {
    borderColor: '#e0d3c2',
    borderRadius: 8,
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
    minHeight: 42,
    padding: 2,
    width: 48,
  },
  matrixLabelCell: {
    alignItems: 'flex-start',
    backgroundColor: '#fbf7ef',
    width: 78,
  },
  matrixHeaderCell: {
    backgroundColor: '#213127',
  },
  matrixHeaderText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  matrixRowLabel: {
    color: '#213127',
    fontSize: 10,
    fontWeight: '700',
  },
  matrixInput: {
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 10,
    borderWidth: 1,
    color: '#17261d',
    fontSize: 13,
    minHeight: 34,
    paddingHorizontal: 4,
    paddingVertical: 5,
    textAlign: 'center',
    width: 38,
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
    minHeight: 38,
  },
  matrixTotalOk: {
    backgroundColor: '#eef6ee',
  },
  matrixTotalInvalid: {
    backgroundColor: '#fff7dd',
  },
  matrixTotalText: {
    fontSize: 13,
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
    maxHeight: 220,
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
    gap: 8,
    marginTop: 12,
  },
  artTableRowCard: {
    backgroundColor: '#fbf7ef',
    borderColor: '#e3d6c5',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  artObservationExtras: {
    gap: 8,
  },
  artColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  artColumnRowCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  artColumnInputGroup: {
    gap: 4,
    width: 92,
  },
  artValueInput: {
    backgroundColor: '#f8f3eb',
    borderColor: '#d8ccbc',
    borderRadius: 10,
    borderWidth: 1,
    color: '#17261d',
    fontSize: 14,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    maxHeight: '92%',
    padding: 20,
    width: '100%',
  },
  dialogOptionScroll: {
    flexGrow: 0,
    maxHeight: '78%',
  },
  dialogOptionList: {
    gap: 10,
    marginBottom: 8,
    paddingBottom: 4,
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
  dialogInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dialogInput: {
    flex: 1,
  },
  dialogGpsButton: {
    alignItems: 'center',
    backgroundColor: '#213127',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  dialogGpsButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
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
    flex: 1,
    padding: 16,
    paddingBottom: 32,
  },
  fullMapContent: {
    flex: 1,
    padding: 16,
  },
  exportPreviewContent: {
    flex: 1,
    padding: 16,
  },
  exportPreviewScroll: {
    backgroundColor: '#151915',
    borderColor: '#2c362d',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginTop: 8,
  },
  exportPreviewScrollContent: {
    padding: 12,
  },
  exportPreviewText: {
    color: '#e8efe7',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
  mapCanvasWrap: {
    backgroundColor: '#eef3ed',
    borderColor: '#cdd9cd',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
    width: '100%',
  },
  transectMapPanel: {
    flex: 1,
  },
  transectMap: {
    flex: 1,
  },
  zonePreviewBlock: {
    gap: 8,
    marginBottom: 12,
  },
  zonePreviewMapWrap: {
    backgroundColor: '#eef3ed',
    borderColor: '#cdd9cd',
    borderRadius: 12,
    borderWidth: 1,
    height: 220,
    overflow: 'hidden',
    width: '100%',
  },
  zoneMapWrap: {
    backgroundColor: '#eef3ed',
    borderColor: '#cdd9cd',
    borderRadius: 12,
    borderWidth: 1,
    height: 360,
    overflow: 'hidden',
    width: '100%',
  },
  zoneLegend: {
    backgroundColor: '#fffaf2',
    borderColor: '#ddd0c0',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  zoneLegendTitle: {
    color: '#213127',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  zoneLegendRows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  zoneLegendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginRight: 6,
  },
  zoneLegendSwatch: {
    borderColor: 'rgba(0,0,0,0.35)',
    borderRadius: 3,
    borderWidth: 1,
    height: 12,
    width: 18,
  },
  zoneLegendLabel: {
    color: '#37443c',
    fontSize: 12,
    fontWeight: '700',
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
  messageUnreadItem: {
    backgroundColor: '#fff3cf',
    borderColor: '#d8a734',
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
