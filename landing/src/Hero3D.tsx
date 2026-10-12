import { useEffect, useRef } from 'react';
import { KENNEY } from './data';

const SPRITES = [
  `${KENNEY}/game-icons/white/gamepad.png`,
  `${KENNEY}/game-icons/white/star.png`,
  `${KENNEY}/game-icons/white/trophy.png`,
  `${KENNEY}/game-icons/white/joystick.png`,
  `${KENNEY}/game-icons/white/medal1.png`,
  `${KENNEY}/emotes/emote_star.png`,
  `${KENNEY}/emotes/emote_heart.png`,
  `${KENNEY}/emotes/emote_idea.png`,
];

// Hero 3D field: instanced shards + Kenney sprite planes, all on one tiny
// spring integrator. Scroll velocity kicks the field; the camera dollies
// with page progress. ponytail: lerp-springs, not a physics engine — a real
// rigid-body sim is invisible at this scale and costs a dependency.
export default function Hero3D() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let dead = false;
    let cleanup = () => {};
    void (async () => {
      const THREE = await import('three');
      if (dead || !canvas) return;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0d0e10, 0.055);
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      camera.position.set(0, 0, 9);
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const key = new THREE.DirectionalLight(0xff6b9d, 1.4);
      key.position.set(4, 6, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xe8eefa, 0.5);
      rim.position.set(-5, -3, 4);
      scene.add(rim);

      const N = 90;
      const geo = new THREE.DodecahedronGeometry(0.16, 0);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.55 });
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      const palette = [0xff6b9d, 0xe8eefa, 0xff8c1a, 0x6b7080].map((c) => new THREE.Color(c));
      const base = new Float32Array(N * 3);
      const pos = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < N; i++) {
        const bx = (Math.random() - 0.5) * 16;
        const by = (Math.random() - 0.5) * 9;
        const bz = (Math.random() - 0.5) * 5 - 1;
        base.set([bx, by, bz], i * 3);
        pos.set([bx, by, bz], i * 3);
        dummy.position.set(bx, by, bz);
        dummy.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, palette[i % palette.length]);
      }
      scene.add(mesh);

      const loader = new THREE.TextureLoader();
      const sprites: THREE.Sprite[] = [];
      const spriteBase: number[] = [];
      SPRITES.forEach((url, i) => {
        loader.load(
          url,
          (tex) => {
            if (dead) return;
            const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
            const s = new THREE.Sprite(m);
            const sc = 0.7 + Math.random() * 0.5;
            s.scale.set(sc, sc, 1);
            const bx = (Math.random() - 0.5) * 13;
            const by = (Math.random() - 0.5) * 7;
            s.position.set(bx, by, -2 - Math.random() * 2);
            spriteBase.push(bx, by);
            sprites.push(s);
            scene.add(s);
          },
          undefined,
          () => {},
        );
        void i;
      });

      let mx = 0;
      let my = 0;
      let lastY = window.scrollY;
      let kick = 0;
      const onMouse = (e: MouseEvent) => {
        mx = (e.clientX / window.innerWidth - 0.5) * 2;
        my = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      const onScroll = () => {
        const y = window.scrollY;
        kick += Math.min(3, Math.abs(y - lastY) / 40);
        lastY = y;
      };
      window.addEventListener('mousemove', onMouse, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });

      const size = () => {
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || 600;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      size();
      window.addEventListener('resize', size);

      const clock = new THREE.Clock();
      let raf = 0;
      const tick = () => {
        const t = clock.getElapsedTime();
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const prog = max > 0 ? Math.min(1, window.scrollY / max) : 0;

        for (let i = 0; i < N; i++) {
          const ix = i * 3;
          const tx = base[ix] + mx * 1.2;
          const ty = base[ix + 1] - prog * 4 - my * 0.8 + Math.sin(t * 0.8 + i) * 0.25;
          const tz = base[ix + 2];
          vel[ix] += (tx - pos[ix]) * 0.035;
          vel[ix + 1] += (ty - pos[ix + 1]) * 0.035;
          vel[ix + 2] += (tz - pos[ix + 2]) * 0.035;
          vel[ix] += (Math.random() - 0.5) * 0.004 * kick;
          vel[ix + 1] += (Math.random() - 0.5) * 0.004 * kick;
          vel[ix] *= 0.92;
          vel[ix + 1] *= 0.92;
          vel[ix + 2] *= 0.92;
          pos[ix] += vel[ix];
          pos[ix + 1] += vel[ix + 1];
          pos[ix + 2] += vel[ix + 2];
          dummy.position.set(pos[ix], pos[ix + 1], pos[ix + 2]);
          dummy.rotation.set(t * 0.3 + i, t * 0.22 + i * 0.7, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        sprites.forEach((s, i) => {
          s.position.y = spriteBase[i * 2 + 1] - prog * 5 + Math.sin(t * 0.7 + i * 1.3) * 0.3;
          s.position.x = spriteBase[i * 2] + mx * 0.8;
        });
        kick *= 0.9;
        camera.position.z = 9 + prog * 2.5;
        camera.position.x += (mx * 0.6 - camera.position.x) * 0.04;
        camera.lookAt(0, -prog * 2, 0);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('mousemove', onMouse);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', size);
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mt = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
          else if (mt) mt.dispose();
        });
        renderer.dispose();
      };
    })();

    return () => {
      dead = true;
      cleanup();
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
