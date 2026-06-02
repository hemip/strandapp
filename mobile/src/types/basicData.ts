export type BasicValue = string | number | boolean | null;

export interface BasicDataListOption {
  value?: string;
  id?: string;
  label: string;
  resource?: string;
  entry_mode?: string;
}

export interface BasicDataDocument {
  id: string;
  label: string;
  type: 'pdf' | 'link' | 'text';
  url?: string;
  local_path?: string;
}

export interface BootstrapResource {
  id: string;
  type: string;
  target_path: string;
  description?: string;
  url?: string;
  asset_name?: string;
}

export interface BasicDataField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  unit?: string;
  list_id?: string;
  dataset?: string;
  value_key?: string;
  display_key?: string;
  lookup_by?: string[];
  filters?: Array<{
    source_field: string;
    dataset_key: string;
  }>;
  global_action?: boolean;
  readonly?: boolean;
  validation?: Record<string, number | string | boolean>;
  [key: string]: unknown;
}

export interface BasicDataSection {
  id: string;
  label: string;
  fields: Array<string | BasicDataField>;
}

export interface BasicDataTab {
  id: string;
  label: string;
  sections: BasicDataSection[];
}

export interface BasicDataConfig {
  meta: {
    id: string;
    version: string;
    source?: string;
    generated_at?: string;
    language?: string;
    platform?: string;
    notes?: string[];
  };
  endpoints: {
    basic_data_url?: string;
    data_upload_url?: string;
    photo_upload_url?: string;
  };
  bootstrap_resources?: BootstrapResource[];
  lists: Record<string, BasicDataListOption[]>;
  global_fields?: BasicDataField[];
  tabs: BasicDataTab[];
  documents?: BasicDataDocument[];
}

export interface BootstrapMetadata {
  basicDataVersion: string;
  bootstrappedAt: string;
  lastUpdateCheckAt?: string;
  source: 'bundled' | 'remote';
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  remoteVersion?: string;
}

export interface GpsSnapshot {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  timestamp?: number;
  status: 'ok' | 'permission_denied' | 'unavailable' | 'error' | 'idle' | 'searching';
  message: string;
}
