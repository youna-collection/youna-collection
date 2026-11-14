import Image from "next/image";
import Link from "next/link";

export type MarqueeTile = { key: string; href: string; imageUrl: string; label: string; soldOut: boolean };

/** Assez de vignettes par copie pour couvrir un grand écran sans trou pendant le défilement. */
const MIN_PER_COPY = 12;
/** Secondes par vignette : vitesse lente et régulière, quel que soit le nombre de couleurs. */
const SECONDS_PER_TILE = 3.5;

function Tile({ tile, hidden }: { tile: MarqueeTile; hidden?: boolean }) {
  return (
    <li className={`w-36 shrink-0 pr-3 md:w-52 md:pr-4 ${hidden ? "marquee-copy" : ""}`} aria-hidden={hidden || undefined}>
      <Link href={tile.href} tabIndex={hidden ? -1 : undefined} className="group block">
        <div className="relative aspect-[3/4] overflow-hidden bg-photo">
          <Image
            src={tile.imageUrl}
            alt={hidden ? "" : tile.label}
            fill
            sizes="(min-width: 768px) 208px, 144px"
            className={`object-cover transition-transform duration-700 group-hover:scale-[1.03] ${tile.soldOut ? "opacity-50" : ""}`}
          />
        </div>
        <p className="mt-2 text-xs">{tile.label}</p>
        {tile.soldOut ? <p className="text-[0.65rem] tracking-widest text-muted uppercase">Épuisé</p> : null}
      </Link>
    </li>
  );
}

/**
 * Bandeau de couleurs qui défile tout seul (CSS uniquement), en pause au survol.
 * La liste est doublée pour boucler sans saut ; la copie est cachée aux lecteurs d'écran.
 * Si la personne a demandé moins d'animations, le bandeau ne bouge pas et se fait défiler au doigt.
 */
export function ColorMarquee({ tiles, reverse = false, label }: { tiles: MarqueeTile[]; reverse?: boolean; label: string }) {
  if (!tiles.length) return null;
  const repeat = Math.ceil(MIN_PER_COPY / tiles.length);
  const copy = Array.from({ length: repeat }, (_, r) => tiles.map((tile) => ({ tile, r }))).flat();
  return (
    <div className="marquee scrollbar-none overflow-hidden" role="region" aria-label={label}>
      <ul
        className={`marquee-track ${reverse ? "marquee-reverse" : ""}`}
        style={{ "--marquee-duration": `${copy.length * SECONDS_PER_TILE}s` } as React.CSSProperties}
      >
        {copy.map(({ tile, r }) => (
          <Tile key={`${tile.key}-${r}`} tile={tile} hidden={r > 0} />
        ))}
        {copy.map(({ tile, r }) => (
          <Tile key={`${tile.key}-${r}-copie`} tile={tile} hidden />
        ))}
      </ul>
    </div>
  );
}
