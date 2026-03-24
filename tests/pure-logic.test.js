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
    STATUS: 6
  },
  getCachedSheetData: () => [
    ['PLATE', 'BRAND', 'MODEL', 'COLOR', 'HOUSE', 'OWNER', 'STATUS'],
    ['3ขฮ8777', 'Mazda', '2', 'แดง', '3/12', 'D', 'active'],
    ['งฉ9934', 'Honda', 'City', 'ดำ', '9/99', 'E', 'active'],
    ['กข1234', 'Toyota', 'Yaris', 'ขาว', '1/23', 'A', 'active'],
    ['80-1234', 'Isuzu', 'Dmax', 'เทา', '2/10', 'C', 'active']
  ]
});

test('cleanPlateText normalizes compact and spaced plate inputs', () => {
  assert.equal(sandbox.cleanPlateText('กข 1234'), 'กข1234');
  assert.equal(sandbox.cleanPlateText('3 ขฮ 8777'), '3ขฮ8777');
  assert.equal(sandbox.cleanPlateText('80-1234'), '80-1234');
});

test('normalizePlateSearchText removes spaces and dashes', () => {
  assert.equal(sandbox.normalizePlateSearchText(' กข-1234 '), 'กข1234');
  assert.equal(sandbox.normalizePlateSearchText('80 1234'), '801234');
});

test('plate query classifiers distinguish full, partial, and tail-number searches', () => {
  assert.equal(sandbox.isValidPlateSearchQuery('1234'), true);
  assert.equal(sandbox.isTailNumberSearchQuery('1234'), true);
  assert.equal(sandbox.isValidPlateSearchQuery('ab'), false);
});

test('generatePlateCandidates includes expected OCR confusion substitutions', () => {
  const alphaCandidates = sandbox.generatePlateCandidates('3ขอ8777', 1);
  assert.ok(alphaCandidates.includes('3ขฮ8777'));

  const thaiCandidates = sandbox.generatePlateCandidates('งง9934', 1);
  assert.ok(thaiCandidates.includes('งฉ9934'));
});

test('resolvePlateFromOcr returns an exact or fuzzy match from cached vehicle data', () => {
  assert.equal(sandbox.resolvePlateFromOcr('3ขฮ8777'), '3ขฮ8777');
  assert.equal(sandbox.resolvePlateFromOcr('3ขอ8777'), '3ขฮ8777');
  assert.equal(sandbox.resolvePlateFromOcr('งง9934'), 'งฉ9934');
});

test('findPlateByStructureHeuristics prefers a same-suffix plate when Thai letters are commonly confused', () => {
  assert.equal(sandbox.findPlateByStructureHeuristics('งง9934'), 'งฉ9934');
});

test('stringSimilarity and editDistance behave consistently', () => {
  assert.equal(sandbox.editDistance('plate', 'plate'), 0);
  assert.equal(sandbox.stringSimilarity('ABC123', 'ABC123'), 1);
  assert.ok(sandbox.stringSimilarity('ABC123', 'ABC124') > sandbox.stringSimilarity('ABC123', 'XYZ999'));
});
