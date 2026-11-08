// Builds tests/e2e/person.y4m: the fake camera feed for end-to-end tests (a person
// sitting at a desk, 640x360 @15fps, ~5 s loop). Needs Python with yt-dlp and
// imageio-ffmpeg:  python -m pip install --user yt-dlp imageio-ffmpeg
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'e2e', 'person.y4m');
const cache = join(root, 'tests', 'e2e', '.cache');
mkdirSync(cache, { recursive: true });

export function ffmpegPath() {
  return execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
}

const ff = ffmpegPath();
const src = join(cache, 'person-src.mp4');
if (!existsSync(src)) {
  execFileSync('python', ['-m', 'yt_dlp', '-q', '--no-warnings', '--ffmpeg-location', ff,
    '-f', 'bv*[height<=720]+ba/b', '--merge-output-format', 'mp4', '-o', src,
    'https://www.youtube.com/shorts/mq-evz4bpZ4'], { stdio: 'inherit' });
}
// The short is 360x640 with the landscape picture in the middle band; cut that band out.
// Use the calm 1.5-5.5 s part (person seated, explosion edit behind; fine for pipeline tests).
execFileSync(ff, ['-v', 'error', '-y', '-ss', '0', '-t', '5', '-i', src,
  '-vf', 'crop=360:203:0:219,scale=640:360,fps=15,format=yuv420p', '-an', out], { stdio: 'inherit' });
console.log('wrote', out);
