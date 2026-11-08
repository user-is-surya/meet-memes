// Talks to the hidden engine iframe (extension origin) via postMessage.
export class EngineClient {
  constructor(root) {
    this.origin = new URL(chrome.runtime.getURL('')).origin;
    this.status = 'starting';
    this.error = '';
    this.onStatus = () => {};
    this.nextId = 1;
    this.pending = new Map();
    this.queue = [];
    this.connected = false;

    this.iframe = document.createElement('iframe');
    this.iframe.src = chrome.runtime.getURL('engine/engine.html');
    this.iframe.setAttribute('aria-hidden', 'true');
    this.iframe.style.cssText = 'width:2px;height:2px;border:0;';
    root.appendChild(this.iframe);

    window.addEventListener('message', (e) => this.handle(e));
  }

  handle(e) {
    if (e.origin !== this.origin || e.source !== this.iframe.contentWindow) return;
    const msg = e.data || {};
    if (msg.type === 'hello') {
      this.connected = true;
      for (const [m, t] of this.queue.splice(0)) this.post(m, t);
    } else if (msg.type === 'status') {
      this.status = msg.state;
      this.error = msg.message || '';
      this.onStatus(this.status, this.error);
    } else if (this.pending.has(msg.id)) {
      this.pending.get(msg.id)(msg);
      this.pending.delete(msg.id);
    }
  }

  post(msg, transfer = []) {
    if (!this.connected) return this.queue.push([msg, transfer]);
    this.iframe.contentWindow.postMessage(msg, this.origin, transfer);
  }

  request(msg, transfer) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.post({ ...msg, id }, transfer);
    });
  }

  async fetchText(path) {
    const r = await this.request({ type: 'fetch', path });
    if (!r.ok) throw new Error('missing ' + path);
    return r.text;
  }

  async fetchBytes(path) {
    const r = await this.request({ type: 'fetch', path });
    return r.ok ? { bytes: r.bytes, mime: r.mime } : null;
  }

  // Builds the Thanos empty-room plate off the page's main thread. Resolves to Uint8ClampedArray | null.
  async buildPlate(rgba, known, w, h) {
    const r = await this.request({ type: 'inpaint', rgba: rgba.buffer, known: known.buffer, w, h }, [rgba.buffer, known.buffer]);
    return r.rgba ? new Uint8ClampedArray(r.rgba) : null;
  }

  detect(bitmap, wantMask) {
    return this.request({ type: 'detect', bitmap, wantMask }, [bitmap]);
  }
}
