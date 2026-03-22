const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGasFiles(relativePaths, extraGlobals) {
  const sandbox = Object.assign({
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Boolean,
    RegExp,
    Array,
    Object,
    Set,
    Map
  }, extraGlobals || {});

  vm.createContext(sandbox);

  relativePaths.forEach((relativePath) => {
    const fullPath = path.resolve(process.cwd(), relativePath);
    const source = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(source, sandbox, { filename: fullPath });
  });

  return sandbox;
}

module.exports = {
  loadGasFiles
};
