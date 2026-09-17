import { cn } from "@/lib/utils";

/**
 * Real photographs of the street the record describes. All three are Creative Commons images
 * from Wikimedia Commons, credited in place and in the footer. They are never shown as boxed
 * images: each one is a full-bleed plate, desaturated and washed toward the palette, with type
 * set over the quiet part of the frame.
 */
export type Photo = {
  src: string;
  alt: string;
  caption: string;
  author: string;
  licence: string;
  href: string;
  /** object-position for the cover crop */
  position: string;
};

export const PHOTOS = {
  nyse: {
    src: "/redeem/photos/nyse-broad-street.jpg",
    alt: "The New York Stock Exchange facade on Broad Street, with flags between the columns",
    caption: "New York Stock Exchange, Broad Street",
    author: "颐园居",
    licence: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:NEW_YORK_STOCK_EXCHANGE_20240521.jpg",
    position: "62% 38%",
  },
  lettering: {
    src: "/redeem/photos/nyse-lettering.jpg",
    alt: "The gilded 'New York Stock Exchange' lettering above the columns, lit at night",
    caption: "Broad Street lettering, at night",
    author: "Billie Grace Ward",
    licence: "CC0",
    href: "https://commons.wikimedia.org/wiki/File:Sign_of_the_New_York_Stock_Exchange,_Broad_Street.jpg",
    position: "58% 30%",
  },
  canyon: {
    src: "/redeem/photos/wall-street-canyon.jpg",
    alt: "Wall Street seen from the steps of Federal Hall, the Exchange across the street",
    caption: "Wall Street from Federal Hall",
    author: "Arild Vågen",
    licence: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:New_York_Stock_Exchange_August_2017_02.jpg",
    position: "38% 45%",
  },
} satisfies Record<string, Photo>;

export const PHOTO_LIST: Photo[] = Object.values(PHOTOS);

/** One-line credit, set in the corner of the plate it belongs to. */
export function PhotoCredit({ photo, dark, className }: { photo: Photo; dark?: boolean; className?: string }) {
  return (
    <a
      href={photo.href}
      target="_blank"
      rel="noreferrer"
      className={cn("font-mono block text-[11px] tracking-wide whitespace-nowrap hover:underline", dark ? "text-[#8fb3a0]" : "text-grey-green", className)}
      title={`${photo.caption}. Photograph by ${photo.author}, ${photo.licence}, via Wikimedia Commons.`}
    >
      {photo.caption} · {photo.author} · {photo.licence}
    </a>
  );
}

/**
 * A full-bleed photographic plate. `tone="paper"` washes the photograph into the page so ink type
 * sits on it; `tone="dark"` is the page's one dark chamber, with light type. Children are laid
 * over the quiet side of the frame by the caller.
 */
export function PhotoBand({ photo, tone = "paper", className, children, minHeight = 520, eager = false }: { photo: Photo; tone?: "paper" | "dark"; className?: string; children?: React.ReactNode; minHeight?: number; /** above the fold: fetch immediately */ eager?: boolean }) {
  const dark = tone === "dark";
  return (
    <section className={cn("photo-band relative isolate overflow-hidden", dark ? "photo-band-dark" : "photo-band-paper", className)} style={{ minHeight }}>
      <img src={photo.src} alt={photo.alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" className="photo-img" style={{ objectPosition: photo.position }} />
      <div aria-hidden className="photo-tint" />
      <div aria-hidden className="photo-wash" />
      <div className="relative z-10 flex min-h-[inherit] flex-col justify-end">{children}</div>
      <PhotoCredit photo={photo} dark={dark} className="absolute right-4 bottom-3 left-4 z-10 truncate text-right opacity-80 hover:opacity-100 sm:left-auto sm:right-6" />
    </section>
  );
}
