import { useEffect, useRef } from 'react';
import { AMBIENT_MODELS } from './data';

// One fixed full-page canvas behind the content. The ten models hang at
// staggered depths; the camera sinks as the page scrolls, so visitors drift
// past them. Pointer proximity pulses the nearest model (emissive + scale
// feedback); scroll velocity kicks the whole field. Nothing here has a name,
// a card, or a caption — pure atmosphere.
// ponytail: lerp springs, not a physics engine; one shared WebGL context,
// not ten canvases (browsers cap contexts around ~8).
export default function AmbientField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let dead = false;
    let cleanup = () => {};
    void (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      if (dead || !canvas) return;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0d0e10, 0.008);
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(4, 6, 7);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xff6b9d, 0.7);
      rim.position.set(-6, -3, 4);
      scene.add(rim);

      // Soft halo behind each model (backlight VFX, additive, cheap).
      const haloTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d')!;
        const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,107,157,0.55)');
        grad.addColorStop(1, 'rgba(255,107,157,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const t = new THREE.CanvasTexture(c);
        return t;
      })();

      interface Floater {
        group: THREE.Group;
        baseY: number;
        spin: number;
        pulse: number;
        vy: number;
      }
      const floaters: Floater[] = [];
      const loader = new GLTFLoader();
      const ray = new THREE.Raycaster();
      const ptr = new THREE.Vector2(-10, -10);
      let ptrActive = false;

      // Stagger loads so ten models don't hammer the network at once.
      AMBIENT_MODELS.forEach((m, i) => {
        setTimeout(() => {
          if (dead) return;
          loader.setResourcePath(m.base);
          loader.load(
            m.url,
            (gltf) => {
              if (dead) return;
              const group = gltf.scene;
              // Normalize: fit roughly the same on-screen size.
              const box = new THREE.Box3().setFromObject(group);
              const size = box.getSize(new THREE.Vector3()).length() || 1;
              const s = (m.scale * 2.2) / size;
              group.scale.setScalar(s);
              group.userData.fit = s;
              group.position.set(m.at[0], m.at[1], m.at[2]);
              const halo = new THREE.Sprite(
                new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
              );
              halo.scale.set(2.6, 2.6, 1);
              halo.position.z = -1.2;
              group.add(halo);
              scene.add(group);
              floaters.push({ group, baseY: m.at[1], spin: m.spin, pulse: 0, vy: 0 });
            },
            undefined,
            () => {},
          );
        }, i * 350);
      });

      let mx = 0;
      let lastY = window.scrollY;
      let kick = 0;
      const onMouse = (e: MouseEvent) => {
        mx = (e.clientX / window.innerWidth - 0.5) * 2;
        const my = -(e.clientY / window.innerHeight - 0.5) * 2;
        ptr.set((e.clientX / window.innerWidth) * 2 - 1, my);
        ptrActive = true;
      };
      const onLeave = () => {
        ptrActive = false;
      };
      const onScroll = () => {
        const y = window.scrollY;
        kick += Math.min(2.5, Math.abs(y - lastY) / 60);
        lastY = y;
      };
      window.addEventListener('mousemove', onMouse, { passive: true });
      document.documentElement.addEventListener('mouseleave', onLeave);
      window.addEventListener('scroll', onScroll, { passive: true });

      // World units per pixel: camera sinks ~38 units over a full page.
      const PX = 38;
      const size = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      };
      size();
      window.addEventListener('resize', size);

      const clock = new THREE.Clock();
      let raf = 0;
      const tick = () => {
        const t = clock.getElapsedTime();
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const prog = Math.min(1, window.scrollY / max);

        // Hover feedback: raycast against loaded models, throttled to every 3rd frame.
        if (ptrActive && floaters.length && (raf % 3 === 0)) {
          ray.setFromCamera(ptr, camera);
          const hits = ray.intersectObjects(floaters.map((f) => f.group), true);
          if (hits.length) {
            let o: THREE.Object3D | null = hits[0].object;
            while (o && !floaters.some((f) => f.group === o)) o = o.parent;
            const f = floaters.find((x) => x.group === o);
            if (f) f.pulse = Math.min(1, f.pulse + 0.35);
          }
        }

        for (const f of floaters) {
          f.pulse *= 0.94;
          f.vy += ((f.baseY + Math.sin(t * 0.7 + f.baseY) * 0.35) - f.group.position.y) * 0.03;
          f.vy *= 0.9;
          f.group.position.y += f.vy + kick * 0.02;
          f.group.rotation.y += 0.004 * f.spin + kick * 0.004;
          const s = (f.group.userData.fit as number) * (1 + f.pulse * 0.18);
          f.group.scale.setScalar(s);
          f.group.traverse((o) => {
            const mesh = o as THREE.Mesh;
            const mt = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (mt && 'emissive' in mt) {
              (mt as THREE.MeshStandardMaterial).emissive.setHex(0xff6b9d);
              (mt as THREE.MeshStandardMaterial).emissiveIntensity = f.pulse * 0.25;
            }
          });
        }
        kick *= 0.92;
        camera.position.y = -prog * PX;
        camera.position.x += (mx * 0.4 - camera.position.x) * 0.045;
        camera.lookAt(camera.position.x * 0.5, camera.position.y, 0);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('mousemove', onMouse);
        document.documentElement.removeEventListener('mouseleave', onLeave);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', size);
        haloTex.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      dead = true;
      cleanup();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-0 h-full w-full opacity-90"
    />
  );
}
