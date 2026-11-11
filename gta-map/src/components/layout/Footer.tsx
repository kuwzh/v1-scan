import { SITE } from "@/lib/config";

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-6 text-center text-sm text-white/60">
      <p>{SITE.disclaimer}</p>
    </footer>
  );
}
