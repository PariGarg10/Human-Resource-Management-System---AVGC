import { useEffect, useState } from 'react';

const DEFAULT_QUOTE =
  'Great teams are not built on policies, but on trust, vision, and the courage to grow together.';

export function LeadershipMessage() {
  const [quote, setQuote] = useState(DEFAULT_QUOTE);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    function load() {
      try {
        setQuote(localStorage.getItem('founder_quote') || DEFAULT_QUOTE);
        setPhoto(localStorage.getItem('founder_photo'));
      } catch {
        setQuote(DEFAULT_QUOTE);
        setPhoto(null);
      }
    }
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'founder_quote' || e.key === 'founder_photo') load();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-black px-10 py-20 transition-shadow duration-300 hover:shadow-[0_0_80px_rgba(237,29,36,0.06)]">
      <span
        className="pointer-events-none absolute left-6 top-0 font-serif text-[120px] leading-none text-[#ed1d24] opacity-20"
        aria-hidden
      >
        &ldquo;
      </span>
      <div className="relative mx-auto max-w-[720px] text-center">
        {photo ? (
          <img
            className="mx-auto mb-5 block h-[120px] w-[120px] rounded-full border-4 border-[#ed1d24] object-cover"
            src={photo}
            alt=""
          />
        ) : (
          <div
            className="mx-auto mb-5 flex h-[120px] w-[120px] items-center justify-center rounded-full border-4 border-[#ed1d24] bg-[#ed1d24] font-['Bebas_Neue',sans-serif] text-4xl text-white"
            aria-hidden
          >
            AM
          </div>
        )}
        <p className="mx-auto max-w-[680px] font-['DM_Sans',sans-serif] text-xl italic leading-[1.8] text-white">
          {quote}
        </p>
        <div className="mt-6 font-['Bebas_Neue',sans-serif] text-2xl tracking-[3px] text-[#ed1d24]">Ashish Mishra</div>
        <div className="mt-1.5 font-['DM_Sans',sans-serif] text-xs uppercase tracking-[2px] text-white/50">
          Founder
        </div>
      </div>
    </section>
  );
}
