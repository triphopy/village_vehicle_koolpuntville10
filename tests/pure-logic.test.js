const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./helpers/load-gas-file');

const sandbox = loadGasFiles([
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
  getCachedSheetData: () => [
    ['PLATE', 'BRAND', 'MODEL', 'COLOR', 'HOUSE', 'OWNER', 'STATUS', 'VEHICLE_TYPE'],
    ['3ทฮ7007', 'Mazda', '2', 'แดง', '30/12', 'D', 'active'],
    ['งฉ9094', 'Honda', 'City', 'ดำ', '90/99', 'E', 'active'],
    ['ทด1234', 'Toyota', 'Yaris', 'ขาว', '10/23', 'A', 'active'],
    ['80-0001', 'Isuzu', 'Dmax', 'เทา', '20/10', 'C', 'active']
  ]
});

test('cleanPlateText normalizes compact and spaced plate inputs', () => {
  assert.equal(sandbox.cleanPlateText('ทด 1234'), 'ทด1234');
  assert.equal(sandbox.cleanPlateText('3 ทฮ 7007'), '3ทฮ7007');
  assert.equal(sandbox.cleanPlateText('80-0001'), '80-0001');
});

test('normalizePlateSearchText removes spaces and dashes', () => {
  assert.equal(sandbox.normalizePlateSearchText(' ทด-1234 '), 'ทด1234');
  assert.equal(sandbox.normalizePlateSearchText('80 0001'), '800001');
});

test('plate query classifiers distinguish full, partial, and tail-number searches', () => {
  assert.equal(sandbox.isValidPlateSearchQuery('1234'), true);
  assert.equal(sandbox.isTailNumberSearchQuery('1234'), true);
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
  assert.equal(sandbox.resolvePlateFromOcr('3ทอ7007'), '3ทฮ7007');
  assert.equal(sandbox.resolvePlateFromOcr('งง9094'), 'งฉ9094');
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
