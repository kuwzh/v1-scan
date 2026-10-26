import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
  {
    // src/lib est le cœur métier : pur TypeScript, aucune dépendance à Next ni à React.
    // C'est ce qui permettra de le réutiliser tel quel (extension Chrome, API B2B).
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"],
              message: "src/lib doit rester pur : pas d'import de Next ni de React ici.",
            },
            {
              group: ["@/app/*", "@/components/*"],
              message: "src/lib ne doit pas dépendre de l'UI.",
            },
          ],
        },
      ],
    },
  },
]);
