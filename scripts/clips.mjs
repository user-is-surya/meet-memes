// Builds bundled meme clips from extension/memes/clips.json:
//   memes/<id>/clip.webp  animated WebP (video only), decoded frame by frame in the page
//   memes/<id>/sound.ogg  Opus audio, mixed into the call
// Needs: python -m pip install --user yt-dlp imageio-ffmpeg
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const memes = join(root, 'extension', 'memes');
const cache = join(root, '.clips-cache');
mkdirSync(cache, { recursive: true });
const ff = execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const spec = JSON.parse(readFileSync(join(memes, 'clips.json'), 'utf8'));
const only = process.argv.slice(2);
const MAX = 1.5 * 1024 * 1024;
let failed = false;

for (const [id, c] of Object.entries(spec)) {
  if (id.startsWith('_') || (only.length && !only.includes(id))) continue;
  const src = join(cache, id + '.mp4');
  if (!existsSync(src)) {
    execFileSync('python', ['-m', 'yt_dlp', '-q', '--no-warnings', '--ffmpeg-location', ff,
      '-f', 'bv*[height<=720]+ba/b', '--merge-output-format', 'mp4', '-o', src, c.url], { stdio: 'inherit' });
  }
  mkdirSync(join(memes, id), { recursive: true });
  const cut = ['-ss', String(c.from), '-to', String(c.to), '-i', src];
  if (c.video) {
    const out = join(memes, id, 'clip.webp');
    const vf = [c.crop && `crop=${c.crop}`, `fps=${c.fps || 24}`, `scale=-2:${c.height || 270}:flags=lanczos`].filter(Boolean).join(',');
    execFileSync(ff, ['-v', 'error', '-y', ...cut, '-an', '-vf', vf, '-c:v', 'libwebp_anim', '-lossless', '0',
      '-q:v', '72', '-compression_level', '5', '-loop', '0', out], { stdio: 'inherit' });
    report(id, out);
  }
  if (c.audio) {
    const out = join(memes, id, 'sound.ogg');
    execFileSync(ff, ['-v', 'error', '-y', ...cut, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k',
      '-af', 'loudnorm=I=-16:TP=-1.5', out], { stdio: 'inherit' });
    report(id, out);
  }
}

function report(id, file) {
  const size = statSync(file).size;
  const ok = size <= MAX;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${id}/${basename(file)}  ${(size / 1024).toFixed(0)} KB`);
}
if (failed) { console.error('Some clips are over 1.5 MB: lower height/fps/quality in clips.json'); process.exit(1); }
