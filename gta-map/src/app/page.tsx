import { SITE } from "@/lib/config";

export default function Home() {
  return (
    <section className="bg-sunset px-4 py-24 text-center">
      <h1 className="font-display text-4xl italic text-white drop-shadow-[0_0_18px_rgb(255,46,136,0.6)] md:text-6xl">
        {SITE.name}
      </h1>
      <p className="mt-4 text-white/90">Squelette du projet : la suite arrive étape par étape.</p>
    </section>
  );
}
