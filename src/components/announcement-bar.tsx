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
          className={`flex shrink-0 items-center gap-6 pr-6 md:gap-10 md:pr-10 ${hidden || i > 0 ? "marquee-copy" : ""}`}
        >
          <span>{PHRASE}</span>
          <span aria-hidden className="text-[0.6rem] text-[#c9a96e]">
            ✦
          </span>
        </span>
      ))}
    </>
  );
}

/** Petite bande tout en haut de la boutique, qui défile lentement. */
export function AnnouncementBar() {
  return (
    <div lang="en" className="marquee overflow-hidden bg-[#2b2520] py-1.5 font-display text-[0.95rem] text-[#eadcc3] italic md:text-base">
      <div className="marquee-track" style={{ "--marquee-duration": "60s" } as React.CSSProperties}>
        <Phrases />
        <Phrases hidden />
      </div>
    </div>
  );
}
