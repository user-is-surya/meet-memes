// Thin WebGL2 helpers: programs, textures (with an LRU cache keyed by source object),
// a unit quad, and blend modes. Coordinates elsewhere are frame-normalized, y down.

const QUAD_VS = `#version 300 es
in vec2 aPos;
uniform vec4 uRect;   // x, y, w, h (normalized, y down)
uniform float uRot;   // radians, clockwise
uniform vec2 uRes;    // output size in pixels
uniform vec4 uCrop;   // source uv rect
out vec2 vUv;
out vec2 vLocal;
void main() {
  vec2 size = uRect.zw * uRes;
  vec2 local = (aPos - 0.5) * size;
  float c = cos(uRot), s = sin(uRot);
  local = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 pix = (uRect.xy + uRect.zw * 0.5) * uRes + local;
  gl_Position = vec4(pix.x / uRes.x * 2.0 - 1.0, 1.0 - pix.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = uCrop.xy + aPos * uCrop.zw;
  vLocal = aPos;
}`;

export const FS_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vLocal;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
`;

// Shared noise helpers for effect shaders.
export const NOISE_GLSL = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: true, desynchronized: true,
  });
  if (!gl) return null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  const programs = new Map();
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('shader: ' + log);
    }
    return sh;
  }

  // Returns a cached program; `vs` defaults to the quad vertex shader.
  function program(key, fs, vs = QUAD_VS) {
    let p = programs.get(key);
    if (p) return p;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(prog));
    const uniforms = new Map();
    p = {
      prog,
      loc(name) {
        if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(prog, name));
        return uniforms.get(name);
      },
    };
    programs.set(key, p);
    return p;
  }

  // Sets uniforms by JS type: number -> float, [a,b] -> vec2 ... [a,b,c,d] -> vec4, Float32Array(9) -> mat3.
  function setUniforms(p, u) {
    for (const [name, v] of Object.entries(u)) {
      const l = p.loc(name);
      if (l === null) continue;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (typeof v === 'boolean') gl.uniform1f(l, v ? 1 : 0);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
  }

  // ---- textures ----
  const cache = new Map(); // source object or string key -> { tex, w, h }
  const MAX_CACHED = 48;
  function newTexture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const isDynamic = (src) => (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement)
    || (typeof OffscreenCanvas !== 'undefined' && src instanceof OffscreenCanvas)
    || (typeof HTMLVideoElement !== 'undefined' && src instanceof HTMLVideoElement)
    || (typeof VideoFrame !== 'undefined' && src instanceof VideoFrame);

  // Uploads `src` (canvas / ImageBitmap / VideoFrame / video) into a texture and binds it to `unit`.
  // Static sources upload once; dynamic ones every call unless opts.static. opts.key reuses a slot.
  function texture(src, unit = 0, opts = {}) {
    const key = opts.key || src;
    let entry = cache.get(key);
    const upload = !entry || opts.dirty || (!opts.static && (opts.key ? true : isDynamic(src)));
    if (!entry) {
      entry = { tex: newTexture(), w: 0, h: 0 };
      cache.set(key, entry);
      if (cache.size > MAX_CACHED) {
        const [oldKey, old] = cache.entries().next().value;
        gl.deleteTexture(old.tex);
        cache.delete(oldKey);
      }
    } else {
      cache.delete(key); cache.set(key, entry); // LRU bump
    }
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    if (upload) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      entry.w = src.displayWidth || src.videoWidth || src.width;
      entry.h = src.displayHeight || src.videoHeight || src.height;
    }
    return entry;
  }

  function forget(key) {
    const e = cache.get(key);
    if (e) { gl.deleteTexture(e.tex); cache.delete(key); }
  }

  function blend(mode = 'normal') {
    if (mode === 'add') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    else if (mode === 'screen') gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else if (mode === 'multiply') gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else if (mode === 'copy') gl.blendFunc(gl.ONE, gl.ZERO);
    else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawQuad(p, uniforms) {
    gl.useProgram(p.prog);
    setUniforms(p, { uCrop: [0, 0, 1, 1], uRot: 0, ...uniforms });
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { gl, canvas, program, setUniforms, texture, forget, blend, drawQuad, quad };
}
