import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('Hostinger runtime 1.9.0 starts AURA core before optional services', () => {
  assert.equal(packageJson.version, '1.9.0');
  const kernelIndex = serverSource.indexOf('await kernel.start()');
  const readyIndex = serverSource.indexOf('bootstrap.runtimeReady = true');
  const horizonIndex = serverSource.indexOf('await horizon.start()');
  const evolutionIndex = serverSource.indexOf('await evolution.start()');
  const commandCenterIndex = serverSource.indexOf('await commandCenter.start()');
  assert.ok(kernelIndex >= 0);
  assert.ok(readyIndex > kernelIndex);
  assert.ok(horizonIndex > readyIndex);
  assert.ok(evolutionIndex > readyIndex);
  assert.ok(commandCenterIndex > readyIndex);
  assert.match(serverSource, /HORIZON indisponible, noyau maintenu actif/);
  assert.match(serverSource, /Evolution indisponible, noyau maintenu actif/);
  assert.match(serverSource, /centre de commande indisponible, noyau maintenu actif/);
});

test('Hostinger config accepts common MySQL environment aliases', () => {
  assert.match(configSource, /process\.env\.MYSQL_HOST/);
  assert.match(configSource, /process\.env\.DATABASE_HOST/);
  assert.match(configSource, /process\.env\.MYSQL_USER/);
  assert.match(configSource, /process\.env\.DATABASE_USER/);
  assert.match(configSource, /process\.env\.MYSQL_PASSWORD/);
  assert.match(configSource, /process\.env\.DATABASE_PASSWORD/);
  assert.match(configSource, /process\.env\.MYSQL_DATABASE/);
  assert.match(configSource, /process\.env\.DATABASE_NAME/);
  assert.match(configSource, /process\.env\.MYSQL_URL/);
});

test('bootstrap endpoint reports 1.9.0', () => {
  assert.match(serverSource, /version:\s*'1\.8\.3'/);
});
