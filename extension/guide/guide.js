// Builds the guide from the bundled meme definitions (so it never drifts from the code)
// and starts the Practice tab.
import { loadBundledMemes } from '../src/shared/settings.js';
import { Practice } from './practice.js';

const $ = (id) => document.getElementById(id);
const fetchText = async (p) => (await fetch(chrome.runtime.getURL(p))).text();

const WHATS_NEW = [
  'Memes now stay sharp with Meet’s background blur and virtual backgrounds.',
  'Meme sounds are heard by everyone in the call.',
  'Modes: Meme, Draw and Spell, switchable from the new 🎭 button on the Meet page or with Alt+Shift+M / D / S.',
  'Draw mode: write in the air with your finger in glowing neon ink, with an air colour palette.',
  'Spell mode: shields, orbs, blasts, portals and channelling in three styles (Strange, Wanda, Doom).',
  'Bad connection (Alt+Shift+B): fake a freezing, choppy call, with an optional auto-leave.',
  'Mirror mode: others see your selfie view (Alt+Shift+R).',
  'Steadier gestures with a charge ring that only you see, so memes fire when you mean them and not by accident.',
  'A rebuilt Thanos snap, Absolute Cinema, Noice and Fanum broccoli, plus new Emotional Damage and Laser eyes memes.',
  'This guide, with a Practice tab to rehearse every gesture.',
];

function renderCards(defs, practice) {
  const tpl = $('card-template');
  const box = $('meme-cards');
  box.replaceChildren();
  for (const def of defs) {
    const card = tpl.content.firstElementChild.cloneNode(true);
    card.id = 'meme-' + def.id;
    card.querySelector('.name').textContent = def.name;
    card.querySelector('.hotkey').textContent = def.hotkey || 'no hotkey';
    card.querySelector('[data-part="origin"]').textContent = def.origin || def.description || '';
    card.querySelector('[data-part="what-happens"]').textContent = def.whatHappens || def.description || '';
    card.querySelector('[data-part="how"]').textContent = def.how || '';
    const tips = card.querySelector('.tips');
    for (const t of [].concat(def.tips || [])) {
      const li = document.createElement('li');
      li.textContent = t;
      tips.appendChild(li);
    }
    if (def.illustration) {
      // Inlined (not <img>) so the drawing takes the page's text colour in light and dark themes.
      const illus = document.createElement('div');
      illus.className = 'illus';
      illus.setAttribute('role', 'img');
      illus.setAttribute('aria-label', `How to do the ${def.name} gesture`);
      card.querySelector('header').after(illus);
      fetchText(`guide/illustrations/${def.illustration}`).then((svg) => { if (svg.trim().startsWith('<svg')) illus.innerHTML = svg; }).catch(() => {});
    }
    if (def.sound && !def.sound.startsWith('synth:')) {
      const play = document.createElement('button');
      play.className = 'play-sound';
      play.textContent = '▶ Play sound';
      play.addEventListener('click', () => {
        const a = new Audio(chrome.runtime.getURL(`${def.base}${def.sound}`));
        const trim = def.soundTrim || {};
        a.currentTime = trim.from || 0;
        if (trim.to) a.addEventListener('timeupdate', () => { if (a.currentTime >= trim.to) a.pause(); });
        a.play().catch(() => {});
      });
      card.querySelector('footer').prepend(play);
    }
    card.querySelector('.practise').addEventListener('click', () => {
      practice.select(def.id);
      location.hash = '#practice';
    });
    box.appendChild(card);
  }
}

async function main() {
  const manifest = chrome.runtime.getManifest();
  $('version').textContent = 'v' + manifest.version;
  if (location.hash === '#whats-new') {
    $('whats-new').hidden = false;
    $('whats-new-version').textContent = 'v' + manifest.version;
    for (const t of WHATS_NEW) {
      const li = document.createElement('li');
      li.textContent = t;
      $('whats-new-list').appendChild(li);
    }
  }
  const defs = await loadBundledMemes(fetchText);
  const practice = new Practice(defs);
  renderCards(defs, practice);
  practice.mount();
}

main().catch((err) => console.error('[meet-memes guide]', err));
