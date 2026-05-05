const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./helpers/load-gas-file');

const cacheRemovals = [];
const cacheStub = {
  remove: (key) => cacheRemovals.push(key),
  removeAll: (keys) => cacheRemovals.push(...keys),
  get: () => null,
  put: () => {}
};

const sandbox = loadGasFiles([
  'src/services/staffService.js',
  'src/services/ocrService.js',
  'src/services/vehicleSearchService.js'
], {
  COL_VEHICLE: {
    PLATE: 0,
    BRAND: 1,
    MODEL: 2,
    COLOR: 3,
    HOUSE: 4,
    OWNER: 5,
    STATUS: 6,
    VEHICLE_TYPE: 7
  },
  OCR_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'gemini-test-key',
  VISION_API_KEY: 'vision-test-key',
  CacheService: {
    getScriptCache: () => cacheStub
  },
  Utilities: {
    base64Encode: () => 'ZmFrZQ=='
  },
  getCachedSheetData: () => [
    ['license_plate', 'brand', 'model', 'color', 'house_no', 'owner_name', 'status', 'vehicle_type'],
    ['3ทฮ7007', 'Mazda', '2', 'แดง', '30/12', 'D', 'active'],
    ['2กว6', 'Honda', 'Wave', 'ดำ', '40/10', 'F', 'active', 'รถจักรยานยนต์'],
    ['งฉ9094', 'Honda', 'City', 'ดำ', '90/99', 'E', 'active'],
    ['ทด1234', 'Toyota', 'Yaris', 'ขาว', '10/23', 'A', 'active'],
    ['80-0001', 'Isuzu', 'Dmax', 'เทา', '20/10', 'C', 'active']
  ]
});

sandbox.getCachedSheetData = () => [
  ['license_plate', 'brand', 'model', 'color', 'house_no', 'owner_name', 'status', 'vehicle_type'],
  ['3ทฮ7007', 'Mazda', '2', 'แดง', '30/12', 'D', 'active'],
  ['2กว6', 'Honda', 'Wave', 'ดำ', '40/10', 'F', 'active', 'รถจักรยานยนต์'],
  ['งฉ9094', 'Honda', 'City', 'ดำ', '90/99', 'E', 'active'],
  ['ทด1234', 'Toyota', 'Yaris', 'ขาว', '10/23', 'A', 'active'],
  ['80-0001', 'Isuzu', 'Dmax', 'เทา', '20/10', 'C', 'active']
];

test('cleanPlateText normalizes compact and spaced plate inputs', () => {
  assert.equal(sandbox.cleanPlateText('ทด 1234'), 'ทด1234');
  assert.equal(sandbox.cleanPlateText('3 ทฮ 7007'), '3ทฮ7007');
  assert.equal(sandbox.cleanPlateText('2 กว 6'), '2กว6');
  assert.equal(sandbox.cleanPlateText('80-0001'), '80-0001');
});

test('normalizePlateSearchText removes spaces and dashes', () => {
  assert.equal(sandbox.normalizePlateSearchText(' ทด-1234 '), 'ทด1234');
  assert.equal(sandbox.normalizePlateSearchText(' 2กว-6 '), '2กว6');
  assert.equal(sandbox.normalizePlateSearchText('80 0001'), '800001');
});

test('plate query classifiers distinguish full, partial, and tail-number searches', () => {
  assert.equal(sandbox.isValidPlateSearchQuery('1234'), true);
  assert.equal(sandbox.isTailNumberSearchQuery('1234'), true);
  assert.equal(sandbox.isValidPlateSearchQuery('2กว6'), true);
  assert.equal(sandbox.looksLikeFullPlateQuery('2กว6'), true);
  assert.equal(sandbox.isValidPlateSearchQuery('ab'), false);
});

test('generatePlateCandidates includes expected OCR confusion substitutions', () => {
  const alphaCandidates = sandbox.generatePlateCandidates('3ทอ7007', 1);
  assert.ok(alphaCandidates.includes('3ทฮ7007'));

  const thaiCandidates = sandbox.generatePlateCandidates('งง9094', 1);
  assert.ok(thaiCandidates.includes('งฉ9094'));
});

test('resolvePlateFromOcr returns an exact or fuzzy match from cached vehicle data', () => {
  assert.equal(sandbox.resolvePlateFromOcr('3ทฮ7007'), '3ทฮ7007');
  assert.equal(sandbox.resolvePlateFromOcr('2กว6'), '2กว6');
  assert.equal(sandbox.resolvePlateFromOcr('3ทอ7007'), '3ทฮ7007');
  assert.equal(sandbox.resolvePlateFromOcr('งง9094'), 'งฉ9094');
});

test('getOcrProvider defaults to gemini and accepts vision when configured', () => {
  sandbox.OCR_PROVIDER = 'unexpected';
  assert.equal(sandbox.getOcrProvider(), 'gemini');

  sandbox.OCR_PROVIDER = 'vision';
  assert.equal(sandbox.getOcrProvider(), 'vision');

  sandbox.OCR_PROVIDER = 'gemini';
});

test('requestPlateOcr routes to the selected provider', () => {
  const imageBlob = {
    getBytes: () => [1, 2, 3],
    getContentType: () => 'image/jpeg'
  };

  sandbox.OCR_PROVIDER = 'vision';
  sandbox.fetchWithRetry = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      responses: [{ fullTextAnnotation: { text: '2กว6' } }]
    })
  });
  assert.equal(sandbox.requestPlateOcr(imageBlob, 'prompt', undefined, []), '2กว6');

  sandbox.OCR_PROVIDER = 'gemini';
  sandbox.fetchWithRetry = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ทด1234' }] } }]
    })
  });
  assert.equal(sandbox.requestPlateOcr(imageBlob, 'prompt', undefined, []), 'ทด1234');
});

test('clearSheetCache removes both hot and stale sheet cache keys', () => {
  cacheRemovals.length = 0;
  sandbox.clearSheetCache('Vehicles');
  assert.deepEqual(cacheRemovals, ['sheet_vehicles', 'sheet_vehicles_stale']);
});

test('searchByPlateDetailed finds motorcycle plates with short suffix digits', () => {
  const result = sandbox.searchByPlateDetailed('2กว6');
  assert.equal(result.found, true);
  assert.match(result.message, /2กว6/);
});

test('findPlateByStructureHeuristics prefers a same-suffix plate when Thai letters are commonly confused', () => {
  assert.equal(sandbox.findPlateByStructureHeuristics('งง9094'), 'งฉ9094');
});

test('stringSimilarity and editDistance behave consistently', () => {
  assert.equal(sandbox.editDistance('plate', 'plate'), 0);
  assert.equal(sandbox.stringSimilarity('ABC123', 'ABC123'), 1);
  assert.ok(sandbox.stringSimilarity('ABC123', 'ABC124') > sandbox.stringSimilarity('ABC123', 'XYZ999'));
});

test('formatVehicleLine includes type details from the new Vehicles sheet columns', () => {
  assert.equal(
    sandbox.formatVehicleLine(['plate', 'Toyota', 'Yaris', 'white', '10/23', 'A', 'active', 'รถยนต์']),
    'Toyota Yaris | สีwhite | ประเภท รถยนต์'
  );
  assert.equal(
    sandbox.formatVehicleLine(['plate', 'Honda', 'City', 'black', '90/99', 'E', 'active', 'รถจักรยานยนต์']),
    'Honda City | สีblack | ประเภท รถจักรยานยนต์'
  );
});

test('getVehicleIcon switches to motorcycle icon for motorcycle rows', () => {
  assert.equal(
    sandbox.getVehicleIcon(['plate', 'Honda', 'City', 'black', '90/99', 'E', 'active', 'motorcycle']),
    '🏍️'
  );
  assert.equal(
    sandbox.getVehicleIcon(['plate', 'Toyota', 'Yaris', 'white', '10/23', 'A', 'active', 'car']),
    '🚗'
  );
});
