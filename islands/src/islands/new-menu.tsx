import { ChevronDown, Gamepad2, Music, Palette, Plus } from 'lucide-react';

// "New" dropdown island: same IDs/classes as the classic markup it
// replaces, so the page's existing open/close JS (.open toggle, Escape,
// outside-click) and .newdrop CSS keep working untouched. React owns the
// icons + entrance effects only — no open-state logic here (classic JS
// toggles .open via classList; this component renders once, stateless).
const ITEMS = [
  { href: '/studio', Icon: Gamepad2, title: 'New project', sub: 'Game or website in Studio' },
  { href: '/music', Icon: Music, title: 'New track', sub: 'Music in the Lab' },
  { href: '/themes#create', Icon: Palette, title: 'New theme pack', sub: 'Restyle Cudic, sell for coins' },
];

export default function NewMenu() {
  return (
    <div className="newdrop" id="newDrop">
      <button
        className="btn btn-ember isl-newbtn"
        id="newDropBtn"
        aria-haspopup="true"
        aria-expanded="false"
        style={{ width: 'auto', padding: '9px 16px', textDecoration: 'none' }}
      >
        <Plus size={16} strokeWidth={1.6} aria-hidden="true" />
        New
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="chev" />
      </button>
      <div className="newdrop-menu" id="newDropMenu" role="menu">
        {ITEMS.map(({ href, Icon, title, sub }) => (
          <a key={href} href={href} role="menuitem" className="isl-row">
            <span className="isl-ic" aria-hidden="true">
              <Icon size={17} strokeWidth={1.8} />
            </span>
            <span className="isl-tx">
              <b>{title}</b>
              <span>{sub}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
