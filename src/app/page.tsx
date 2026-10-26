import { APP_NAME } from "@/lib/config";

// Page provisoire : la vraie page (bouton « Vérifier une annonce », résultat) arrive à l'étape 6.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Les signaux d&apos;alerte d&apos;une annonce, en quelques secondes.
      </p>
    </main>
  );
}
