import React from 'react';
import renderer from 'react-test-renderer';

jest.mock('react-native-get-random-values', () => ({}));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('react-native-camera-kit', () => ({
  Camera: 'Camera',
  CameraType: {Back: 'back'},
}));
jest.mock('react-native-maps', () => {
  const {View} = require('react-native');
  const MockMapView = ({children}: {children?: React.ReactNode}) => <View>{children}</View>;
  return {
    __esModule: true,
    default: MockMapView,
    Marker: 'Marker',
    Polyline: 'Polyline',
    UrlTile: 'UrlTile',
  };
});
jest.mock('uuid', () => ({
  v4: () => '123e4567-e89b-12d3-a456-426614174000',
}));

jest.mock('../src/hooks/useGpsStatus', () => ({
  useGpsStatus: () => ({
    gps: {
      status: 'idle',
      message: 'GPS ej hämtad ännu.',
    },
    refreshGps: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../src/services/bootstrapService', () => ({
  initializeApplication: jest.fn().mockResolvedValue({
    basicData: {
      meta: {id: 'test', version: '1.0.0'},
      endpoints: {},
      lists: {},
      global_fields: [],
      tabs: [
        {
          id: 'oversikt',
          label: 'Översikt',
          sections: [],
        },
      ],
    },
    notices: [],
    updateCheck: {updateAvailable: false},
  }),
  runManualBasicDataUpdate: jest.fn(),
}));

jest.mock('../src/services/publicFileService', () => ({
  loadWorkingDraft: jest.fn().mockResolvedValue(null),
  saveWorkingDraft: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/inventoryStore', () => ({
  deleteInventoryFromDevice: jest.fn().mockResolvedValue(undefined),
  getInventoryIdFromDraft: jest.fn(() => null),
  loadInventoryIndex: jest.fn().mockResolvedValue([]),
  markInventorySubmitted: jest.fn().mockResolvedValue(null),
  saveInventoryDraftSnapshot: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/services/datasetService', () => ({
  loadConfiguredDatasets: jest.fn().mockResolvedValue({}),
  filterDatasetRows: jest.fn((_, rows) => rows),
  findDatasetRow: jest.fn(() => null),
  getUniqueDatasetOptions: jest.fn(() => []),
}));

const App = require('../App').default;

test('appen renderar utan krascher', async () => {
  let tree: renderer.ReactTestRenderer | undefined;

  await renderer.act(async () => {
    tree = renderer.create(<App />);
  });

  expect(tree).toBeDefined();
});
