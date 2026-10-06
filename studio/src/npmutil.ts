// Pure helpers for npm-package support in previews. Zero imports so they
// stay unit-testable outside the workbench (see studio tests in docs).
// Nothing here touches the publish pipeline by design.

export function importMapNames(baseHtml: string): Set<string> {
  const names = new Set<string>();
  const m = /"imports"\s*:\s*\{([^}]*)\}/.exec(baseHtml);
  if (m == null) return names;
  const re = /"([^"]+)"\s*:/g;
  let k: RegExpExecArray | null;
  while ((k = re.exec(m[1])) != null) names.add(k[1]);
  return names;
}

export function bareRoot(spec: string): string {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
}

// import decl / export / import.meta need type="module". Dynamic import()
// and identifiers like `important` must NOT match (\b guards the latter).
export function needsModule(js: string): boolean {
  return (
    /(^|[;{}])\s*import\b\s*(?:["'{*]|[A-Za-z_$])/.test(js) ||
    /(^|[;{}])\s*export\s/.test(js) ||
    /\bimport\.meta\b/.test(js)
  );
}

// Pull static import lines above a wrapper (classic <script> can't hold
// `import` even inside try{} — only module top level is legal).
export function splitImports(code: string): { head: string; body: string } {
  const head: string[] = [];
  const body: string[] = [];
  for (const line of code.split('\n')) {
    if (/^\s*import\b\s*(?:["'{*]|[A-Za-z_$])/.test(line) && !/import\s*\(/.test(line)) head.push(line);
    else body.push(line);
  }
  return { head: head.join('\n'), body: body.join('\n') };
}

export function rewriteBareImports(
  html: string,
  skip: Set<string>,
  isExternal: (ref: string) => boolean
): string {
  // CSS can't be imported as JS (MIME error), so single-line static CSS
  // imports are lifted into <link> tags in <head>. Dynamic import('*.css')
  // is left alone — it failed before this change and still does.
  // (Multi-line import blocks ending in .css are rare; those fall through
  // to the normal pass unchanged in behavior.)
  const cssHrefs: string[] = [];
  const out = html.replace(
    /<script([^>]*)>([\s\S]*?)<\/script\s*>/gi,
    (tag, attrs: string, code: string) => {
      if (/\bsrc\s*=/.test(attrs)) return tag;
      const lifted = String(code).replace(
        /^(\s*)import\b(?!\s*\()[^;]*?["']([^"']+\.css(\?[^"']*)?)["'][^;]*;?/gm,
        (_stmt, _ws: string, spec: string) => {
          if (isExternal(spec)) return _stmt;
          if (skip.has(spec) || skip.has(bareRoot(spec))) return _stmt;
          cssHrefs.push('https://esm.sh/' + spec);
          return '/* css: ' + spec + ' */';
        }
      );
      const js = lifted.replace(
        /(from\s+|import\s*\(\s*|import\s+)(["'])([^"']+)\2/g,
        (im, pre: string, q: string, spec: string) => {
          if (isExternal(spec)) return im;
          if (skip.has(spec) || skip.has(bareRoot(spec))) return im;
          // Dynamic import('*.css') can't lift to a link (it's an
          // expression) — leave it; it fails at runtime, as before.
          if (/\.css(\?|#|$)/.test(spec) && /^import\s*\(\s*$/.test(pre)) return im;
          return pre + q + 'https://esm.sh/' + spec + q;
        }
      );
      return '<script' + attrs + '>' + js + '</script>';
    }
  );
  if (!cssHrefs.length) return out;
  const links = cssHrefs.map((h) => '<link rel="stylesheet" href="' + h + '">').join('');
  return /<\/head\s*>/i.test(out) ? out.replace(/<\/head\s*>/i, links + '</head>') : links + out;
}

// Split "name[@version]" —/npm version pinning rides the esm.sh URL.
export function splitVersion(clean: string): { name: string; version: string } {
  const at = clean.lastIndexOf('@');
  if (at > 0 && /^[0-9][0-9A-Za-z.-]*$/.test(clean.slice(at + 1))) {
    return { name: clean.slice(0, at), version: clean.slice(at + 1) };
  }
  return { name: clean, version: '' };
}

export function isValidPackageName(clean: string): boolean {
  const { name } = splitVersion(clean);
  return /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(name);
}

export function identFor(clean: string): string {
  const { name } = splitVersion(clean);
  const raw = name.startsWith('@') ? name.split('/')[1] ?? 'pkg' : name.split('/')[0];
  return (
    raw
      .replace(/[^a-zA-Z0-9$ ]/g, ' ')
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
      .join('') || 'pkg'
  );
}

// Classic-editor scene JSON (array of {type,name,color,position,rotation,
// scale,scripts:[{code}]}) converted to a standalone single-file game.
// Old rows carry code in `scene` with no `files`; Studio boots those into
// the demo template without this. Returns null when there is nothing to
// convert. The next project save persists the files (one-time migration).
export function sceneToFiles(scene: unknown, title: string): Record<string, string> | null {
  let arr: unknown = scene;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  const objs = arr.filter(
    (o): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o)
  );
  if (!objs.length) return null;
  const safeTitle = String(title || 'My Game').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dataJson = JSON.stringify(objs).replace(/<\//g, '<\\/');
  const html =
    '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + safeTitle + '</title>\n' +
    '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block}</style>\n' +
    '<script type="importmap">\n{"imports":{' +
    '"three":"https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js",' +
    '"three/addons/":"https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/"' +
    '}}\n<\/script>\n</head>\n<body>\n<canvas id="c"></canvas>\n' +
    '<script type="module">\nimport * as THREE from \'three\';\n' +
    'import { OrbitControls } from \'three/addons/controls/OrbitControls.js\';\n' +
    '// Converted from a classic Cudic scene — edit freely, this file is yours now.\n' +
    'const SCENE_DATA = ' + dataJson + ';\n' +
    'const canvas = document.getElementById(\'c\');\n' +
    'const scene = new THREE.Scene();\nscene.background = new THREE.Color(0x252630);\n' +
    'let camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);\ncamera.position.set(5, 4, 5);\n' +
    'const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });\n' +
    'renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));\n' +
    'renderer.shadowMap.enabled = true;\nrenderer.toneMapping = THREE.ACESFilmicToneMapping;\n' +
    'const controls = new OrbitControls(camera, canvas);\ncontrols.enableDamping = true;\n' +
    'scene.add(new THREE.AmbientLight(0xffffff, 0.6));\n' +
    'const dl = new THREE.DirectionalLight(0xffffff, 1.2);\n' +
    'dl.position.set(10, 15, 10);\ndl.castShadow = true;\ndl.shadow.mapSize.set(1024, 1024);\nscene.add(dl);\n' +
    'scene.add(new THREE.HemisphereLight(0x68aed4, 0x430067, 0.4));\n' +
    'scene.add(new THREE.GridHelper(40, 40, 0x555568, 0x3a3a4a));\n' +
    'function resize(){const w=window.innerWidth,h=window.innerHeight;' +
    'camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}\n' +
    'window.addEventListener(\'resize\', resize);\nresize();\n' +
    'const primitiveGeos = {\n' +
    'box: () => new THREE.BoxGeometry(1, 1, 1),\n' +
    'sphere: () => new THREE.SphereGeometry(0.5, 24, 16),\n' +
    'cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24),\n' +
    'plane: () => new THREE.PlaneGeometry(2, 2),\n' +
    'cone: () => new THREE.ConeGeometry(0.5, 1, 24),\n' +
    'torus: () => new THREE.TorusGeometry(0.4, 0.15, 16, 32)\n};\n' +
    'const gameObjects = [];\nconst updateFns = [];\n' +
    'function num3(v, fb){return (Array.isArray(v) && v.length === 3 && v.every(n => isFinite(n))) ? v : fb;}\n' +
    '(SCENE_DATA || []).forEach(d => {\nlet obj;\n' +
    'const t = d.type;\n' +
    'if (t === \'light\') obj = new THREE.PointLight(0xffffff, 1, 20);\n' +
    'else if (t === \'directional_light\') obj = new THREE.DirectionalLight(0xfff4e0, 1.5);\n' +
    'else if (t === \'spot_light\') obj = new THREE.SpotLight(0xffffff, 1, 30, Math.PI / 6, 0.3, 1);\n' +
    'else if (t === \'ambient_light\') obj = new THREE.AmbientLight(0x404060, 0.4);\n' +
    'else if (t === \'hemisphere_light\') obj = new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.6);\n' +
    'else if (t === \'camera\') { obj = new THREE.PerspectiveCamera(60, 1, 0.1, 100); camera = obj; controls.enabled = false; resize(); }\n' +
    'else if (t === \'empty\') obj = new THREE.Object3D();\n' +
    'else if (t === \'solid_sky\') obj = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 15), new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide }));\n' +
    'else if (t === \'gradient_sky\') { obj = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 15), new THREE.MeshBasicMaterial({ color: 0x1a1a5e, side: THREE.BackSide })); }\n' +
    'else if (t === \'starfield_sky\') { obj = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 15), new THREE.MeshBasicMaterial({ color: 0x050510, side: THREE.BackSide })); }\n' +
    'else {\nconst geo = primitiveGeos[t] ? primitiveGeos[t]() : new THREE.BoxGeometry(1, 1, 1);\n' +
    'let col = 0xbfff3c;\ntry { if (d.color) col = new THREE.Color(d.color); } catch (e) {}\n' +
    'const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: 0.1 });\n' +
    'obj = new THREE.Mesh(geo, mat);\nobj.castShadow = true;\nobj.receiveShadow = true;\n}\n' +
    'obj.name = (typeof d.name === \'string\' && d.name) || \'Object\';\n' +
    'obj.position.set.apply(obj.position, num3(d.position, [0, 0, 0]));\n' +
    'obj.rotation.set.apply(obj.rotation, num3(d.rotation, [0, 0, 0]));\n' +
    'obj.scale.set.apply(obj.scale, num3(d.scale, [1, 1, 1]));\n' +
    'if (d.attachTo) obj.userData.attachTo = d.attachTo;\n' +
    'scene.add(obj);\ngameObjects.push(obj);\n' +
    'const scripts = Array.isArray(d.scripts) ? d.scripts : [];\n' +
    'scripts.forEach(s => {\nif (!s || !s.code || !String(s.code).trim()) return;\n' +
    'try {\nconst fn = new Function(\'scene\', \'objects\', \'camera\', \'self\', \'update\', String(s.code));\n' +
    'fn(scene, gameObjects, camera, obj, null);\n' +
    '} catch (e) { console.error(obj.name + \': \' + e.message); }\n' +
    'try {\nconst wrapper = new Function(\'scene\', \'objects\', \'camera\', \'self\', String(s.code) + \'\\nif (typeof update === "function") return update;\\nreturn null;\');\n' +
    'const updateFn = wrapper(scene, gameObjects, camera, obj);\n' +
    'if (typeof updateFn === \'function\') updateFns.push({ self: obj, fn: updateFn });\n' +
    '} catch (e) {}\n});\n});\n' +
    'function animate() {\nrequestAnimationFrame(animate);\n' +
    'if (camera.userData && camera.userData.attachTo) {\n' +
    'const target = gameObjects.find(o => o.name === camera.userData.attachTo);\n' +
    'if (target) { camera.position.copy(target.position); camera.rotation.copy(target.rotation); }\n' +
    '}\n' +
    'if (controls.enabled) controls.update();\n' +
    'updateFns.forEach(({ self, fn }) => { try { fn(); } catch (e) { console.error(self.name + \': \' + e.message); } });\n' +
    'renderer.render(scene, camera);\n}\nanimate();\n<\/script>\n</body>\n</html>\n';
  return { 'index.html': html };
}
