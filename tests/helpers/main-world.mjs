// Loads the MAIN-world classic scripts into a node:vm sandbox with fake WebRTC /
// insertable-stream classes, so the sender hook can be tested without a browser.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
export const MAIN_FILES = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  .content_scripts.find((c) => c.world === 'MAIN').js;

export class FakeTrack {
  constructor(kind = 'video', label = kind + '-cam') {
    this.kind = kind; this.label = label; this.enabled = true; this.muted = false;
    this.readyState = 'live'; this.listeners = {}; this.stopped = false;
  }
  stop() { this.stopped = true; this.readyState = 'ended'; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) fn(e); return true; }
  getSettings() { return { width: 640, height: 360 }; }
  getCapabilities() { return {}; }
  getConstraints() { return {}; }
  applyConstraints() { return Promise.resolve(); }
  clone() { return new FakeTrack(this.kind, this.label); }
}

export function makeSandbox({ insertable = true, processorThrows = false, navigator = {} } = {}) {
  const created = { processors: [], generators: [] };
  class MediaStreamTrackProcessor {
    constructor({ track }) {
      if (processorThrows) throw new Error('boom');
      this.track = track;
      this.readable = new ReadableStream({ start: (c) => { this.controller = c; } });
      created.processors.push(this);
    }
  }
  class MediaStreamTrackGenerator extends FakeTrack {
    constructor({ kind }) {
      super(kind, 'generator');
      this.frames = [];
      this.writable = new WritableStream({ write: (f) => { this.frames.push(f); } });
      created.generators.push(this);
    }
  }
  class RTCRtpSender {
    constructor(track) { this._track = track; }
    get track() { return this._track; }
    replaceTrack(t) { this._track = t; return Promise.resolve(); }
  }
  class RTCPeerConnection {
    constructor() { this.senders = []; }
    addTrack(track) { const s = new RTCRtpSender(track); this.senders.push(s); return s; }
    addTransceiver(t) { const s = new RTCRtpSender(typeof t === 'string' ? null : t); this.senders.push(s); return { sender: s }; }
  }
  class MediaStream {
    constructor(tracks = []) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
  }
  const sandbox = {
    console, Event: class Event { constructor(type) { this.type = type; } },
    ReadableStream, WritableStream, TransformStream, Promise, Map, WeakMap, Set, Symbol, Object, Error,
    setTimeout, clearTimeout, setInterval, clearInterval, performance, AbortController,
    RTCRtpSender, RTCPeerConnection, MediaStream,
    document: { getElementById: () => null, documentElement: {} },
    navigator,
  };
  if (insertable) Object.assign(sandbox, { MediaStreamTrackProcessor, MediaStreamTrackGenerator });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of MAIN_FILES) vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
  return { sandbox, created, MM: sandbox.__meetMemes };
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
