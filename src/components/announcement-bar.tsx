const PHRASE = "The beauty of modesty";
/** Assez de répétitions pour remplir un grand écran, puis la même série doublée pour boucler sans saut. */
const REPEAT = 8;

function Phrases({ hidden }: { hidden?: boolean }) {
  return (
    <>
      {Array.from({ length: REPEAT }, (_, i) => (
        <span
          key={i}
          aria-hidden={hidden || i > 0 || undefined}
          className={`shrink-0 pr-16 md:pr-24 ${hidden || i > 0 ? "marquee-copy" : ""}`}
        >
          {PHRASE}
        </span>
      ))}
    </>
  );
}

/** Petite bande tout en haut de la boutique, qui défile lentement : police du site, fond à peine plus foncé que la page. */
export function AnnouncementBar() {
  return (
    <div lang="en" className="marquee overflow-hidden border-b border-sand/60 bg-[#ede5d8] py-2 text-[0.7rem] tracking-[0.25em] text-ink uppercase">
      <div className="marquee-track" style={{ "--marquee-duration": "60s" } as React.CSSProperties}>
        <Phrases />
        <Phrases hidden />
      </div>
    </div>
  );
}
