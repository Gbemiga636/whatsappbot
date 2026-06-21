require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { spawn } = require('child_process');

const candidates = [
  process.env.CLOUDFLARED_PATH,
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  'cloudflared',
].filter(Boolean);

const port = process.env.PORT || 3000;
const args = ['tunnel', '--url', `http://localhost:${port}`];

function run(exe) {
  console.log(`Starting tunnel → http://localhost:${port}`);
  console.log(`Using: ${exe}\n`);
  const child = spawn(exe, args, { stdio: 'inherit', shell: exe === 'cloudflared' });
  child.on('exit', (code) => process.exit(code ?? 0));
}

function tryNext(i) {
  if (i >= candidates.length) {
    console.error(
      'cloudflared not found.\n' +
        'Install: winget install Cloudflare.cloudflared\n' +
        'Then close and reopen PowerShell, or run:\n' +
        '  & "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe" tunnel --url http://localhost:3000'
    );
    process.exit(1);
  }
  const exe = candidates[i];
  if (exe !== 'cloudflared' && !require('fs').existsSync(exe)) {
    return tryNext(i + 1);
  }
  run(exe);
}

tryNext(0);
