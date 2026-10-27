import { useEffect, useRef } from "react";
import { parallax } from "./parallax.js";
const LAYERS = [["01-sky",0],["02-stars",0.03],["03-skyline",0.06],["04-clouds",0.1],["05-studio",0.18],["06-floaters",0.32],["07-foreground",0.65]];
export default function ParallaxStudio({ base = "/layers/png/4x", strength = 24 }) {
  const ref = useRef(null);
  useEffect(() => parallax(ref.current, { strength }), [strength]);
  return (
    <div ref={ref} className="px-stage">
      {LAYERS.map(([f, d]) => <img key={f} src={`${base}/${f}.png`} data-depth={d} alt="" draggable={false} />)}
    </div>
  );
}
