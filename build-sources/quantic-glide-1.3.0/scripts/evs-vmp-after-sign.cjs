'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function envFlag(name) {
  return /^(1|true|yes|required)$/i.test(String(process.env[name] || '').trim());
}

async function runPython(args, options = {}) {
  const candidates = process.platform === 'win32'
    ? [process.env.PYTHON, 'py', 'python', 'python3'].filter(Boolean)
    : [process.env.PYTHON, 'python3', 'python'].filter(Boolean);
  let lastError = null;
  for (const command of [...new Set(candidates)]) {
    try {
      const prefix = command === 'py' ? ['-3'] : [];
      return await execFileAsync(command, [...prefix, ...args], {
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      });
    } catch (error) {
      lastError = error;
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw lastError || new Error('Python 3 introuvable pour la signature VMP.');
}

module.exports = async function afterSign(context) {
  if (context?.electronPlatformName !== 'win32') return;

  const required = envFlag('QUANTIC_NETFLIX_VMP_REQUIRED');
  const requested = required || envFlag('QUANTIC_NETFLIX_VMP_SIGN');
  if (!requested) {
    console.warn('[vmp] Build local sans demande VMP production. Netflix ne doit pas être annoncé comme compatible pour cet artefact.');
    return;
  }

  const appOutDir = context?.appOutDir;
  if (!appOutDir || !fs.existsSync(appOutDir)) {
    throw new Error(`Répertoire Electron packagé introuvable pour VMP: ${appOutDir || '<vide>'}`);
  }

  const executable = fs.readdirSync(appOutDir).find((name) => /\.exe$/i.test(name) && !/^elevate\.exe$/i.test(name));
  if (!executable) throw new Error(`Executable Quantic introuvable dans ${appOutDir}`);

  const env = { ...process.env, EVS_NO_ASK: '1' };

  try {
    console.log(`[vmp] Signature production Widevine de ${executable}...`);
    const signed = await runPython(
      ['-m', 'castlabs_evs.vmp', '--no-ask', 'sign-pkg', appOutDir],
      { env }
    );
    if (signed.stdout) console.log(signed.stdout.trim());
    if (signed.stderr) console.error(signed.stderr.trim());

    console.log('[vmp] Verification de la signature VMP production...');
    const verified = await runPython(
      ['-m', 'castlabs_evs.vmp', '--no-ask', 'verify-pkg', '--streaming', '--min-days', '7', appOutDir],
      { env }
    );
    if (verified.stdout) console.log(verified.stdout.trim());
    if (verified.stderr) console.error(verified.stderr.trim());
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error).trim();
    const message = `Signature VMP production impossible. Authentifiez d'abord CastLabs EVS puis relancez le build. ${detail}`;
    if (required) throw new Error(message);
    console.warn(`[vmp] ${message}`);
    return;
  }

  const marker = path.join(context.outDir || path.dirname(appOutDir), 'QUANTIC-NETFLIX-VMP-VERIFIED.txt');
  fs.writeFileSync(marker, `VMP production verified\nExecutable: ${executable}\nUTC: ${new Date().toISOString()}\n`, 'utf8');
  console.log(`[vmp] OK: ${marker}`);
};
