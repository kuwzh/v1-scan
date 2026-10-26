// Génère les captures de test (maquettes HTML d'une application FICTIVE « ReVente »).
// Aucune marque réelle, aucune donnée réelle. À relancer seulement pour modifier les maquettes :
//   node evals/images/generer.mjs
// Nécessite Playwright (non listé dans package.json : c'est un outil de développement ponctuel).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ici = dirname(fileURLToPath(import.meta.url));

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; width: 390px; min-height: 844px; background: #f4f4f6; color: #1c1c1e;
         font-family: "Helvetica Neue", Arial, "DejaVu Sans", sans-serif; font-size: 15px; }
  .top { height: 56px; background: #fff; border-bottom: 1px solid #e3e3e8; display: flex;
         align-items: center; padding: 0 16px; font-weight: 700; font-size: 17px; }
  .top small { margin-left: auto; font-weight: 400; color: #8e8e93; }
  .card { background: #fff; margin: 12px; padding: 16px; border-radius: 14px; }
  .avatar { width: 64px; height: 64px; border-radius: 50%; background: #c7d2fe; display: flex;
            align-items: center; justify-content: center; font-weight: 700; font-size: 24px; color: #3730a3; }
  .row { display: flex; gap: 14px; align-items: center; }
  h1 { margin: 0; font-size: 20px; } h2 { margin: 0 0 6px; font-size: 19px; }
  .muted { color: #6b6b73; } .stars { color: #f5a623; letter-spacing: 1px; }
  .ok { color: #1a7f37; } .ko { color: #9a6700; }
  .li { padding: 9px 0; border-top: 1px solid #efeff3; display: flex; justify-content: space-between; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px; }
  .thumb { background: #dcdce2; border-radius: 10px; height: 120px; }
  .photo { background: #d9dbe3; height: 230px; position: relative; display: flex; align-items: center;
           justify-content: center; color: #8e8e99; font-size: 14px; }
  .count { position: absolute; right: 12px; bottom: 12px; background: rgba(0,0,0,.6); color: #fff;
           padding: 3px 10px; border-radius: 12px; font-size: 13px; }
  .price { font-size: 26px; font-weight: 800; margin: 4px 0 10px; }
  .cover { height: 38px; background: #b4b4bd; border-radius: 6px; margin: 4px 0 10px; }
  .chat { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .b { max-width: 78%; padding: 10px 13px; border-radius: 16px; line-height: 1.3; }
  .l { align-self: flex-start; background: #e6e6ea; border-bottom-left-radius: 4px; }
  .r { align-self: flex-end; background: #2f6bff; color: #fff; border-bottom-right-radius: 4px; }
  .n { align-self: stretch; background: #ececf0; text-align: center; border-radius: 10px; }
  .item { background: #fff; margin: 0; padding: 10px 16px; display: flex; gap: 12px; align-items: center;
          border-bottom: 1px solid #e3e3e8; }
  .item .t { width: 44px; height: 44px; background: #d9dbe3; border-radius: 8px; }
`;

const page = (corps) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${corps}</body></html>`;

const MAQUETTES = {
  "profil-sain": page(`
    <div class="top">ReVente <small>Profil</small></div>
    <div class="card">
      <div class="row"><div class="avatar">CB</div>
        <div><h1>claire_b</h1><div class="stars">★★★★★ <span class="muted">4,8</span></div>
        <div class="muted">87 évaluations</div></div></div>
      <div class="li"><span>Membre depuis</span><span>mars 2023</span></div>
      <div class="li"><span>Profil</span><span class="ok">✓ Vérifié</span></div>
      <div class="li"><span>E-mail</span><span class="ok">✓</span></div>
      <div class="li"><span>Téléphone</span><span class="ok">✓</span></div>
      <div class="li"><span>Localisation</span><span>Paris 11e</span></div>
      <div class="li"><span>Articles en vente</span><span>34</span></div>
    </div>
    <div class="grid"><div class="thumb"></div><div class="thumb"></div><div class="thumb"></div><div class="thumb"></div></div>`),

  "profil-neuf": page(`
    <div class="top">ReVente <small>Profil</small></div>
    <div class="card">
      <div class="row"><div class="avatar">A7</div>
        <div><h1>alex_77</h1><div class="muted">Aucune évaluation pour le moment</div></div></div>
      <div class="li"><span>Membre depuis</span><span>4 jours</span></div>
      <div class="li"><span>Profil</span><span class="ko">Non vérifié</span></div>
      <div class="li"><span>Localisation</span><span>Lyon</span></div>
      <div class="li"><span>Articles en vente</span><span>14</span></div>
    </div>
    <div class="grid"><div class="thumb"></div><div class="thumb"></div><div class="thumb"></div><div class="thumb"></div></div>`),

  // Ni date d'inscription ni mention de vérification : l'IA ne doit rien en dire.
  "profil-sans-date": page(`
    <div class="top">ReVente <small>Profil</small></div>
    <div class="card">
      <div class="row"><div class="avatar">MD</div>
        <div><h1>marc_d</h1><div class="stars">★★★★☆ <span class="muted">4,5</span></div>
        <div class="muted">12 évaluations</div></div></div>
      <div class="li"><span>Localisation</span><span>Lyon</span></div>
      <div class="li"><span>Articles en vente</span><span>8</span></div>
    </div>
    <div class="grid"><div class="thumb"></div><div class="thumb"></div></div>`),

  "annonce-luxe": page(`
    <div class="top">ReVente <small>Annonce</small></div>
    <div class="photo">photo de l'article<div class="count">1/1</div></div>
    <div class="card">
      <h2>Sac Louis Vuitton Speedy 30</h2>
      <div class="price">25,00 €</div>
      <div class="li"><span>Marque</span><span>Louis Vuitton</span></div>
      <div class="li"><span>État</span><span>Neuf avec étiquette</span></div>
      <p>Vends sac neuf, jamais porté. Envoi rapide.</p>
    </div>
    <div class="card"><div class="row"><div class="avatar" style="width:44px;height:44px;font-size:16px">MC</div>
      <div><b>mia_c</b><div class="muted">Membre depuis 2 jours</div></div></div></div>`),

  // Le bloc du prix est recouvert : le prix n'est PAS lisible, l'IA doit répondre null.
  "annonce-prix-masque": page(`
    <div class="top">ReVente <small>Annonce</small></div>
    <div class="photo">photo de l'article<div class="count">1/6</div></div>
    <div class="card">
      <h2>Montre Rolex Datejust 36</h2>
      <div class="cover"></div>
      <div class="li"><span>Marque</span><span>Rolex</span></div>
      <div class="li"><span>État</span><span>Très bon état</span></div>
      <p>Montre automatique, bracelet acier, boîte et papiers.</p>
    </div>`),

  "conversation-saine": page(`
    <div class="top">léa_m <small>Pull en laine · 15 €</small></div>
    <div class="chat">
      <div class="b l">Bonjour ! Oui il est toujours disponible 😊</div>
      <div class="b r">Super, je le prends. Comment on fait ?</div>
      <div class="b l">Tu peux payer via l'appli, j'envoie demain en point relais.</div>
    </div>`),

  "conversation-suspecte": page(`
    <div class="top">sam_t <small>Sac à main · 90 €</small></div>
    <div class="chat">
      <div class="b l">Écris-moi sur WhatsApp au 06 11 22 33 44</div>
      <div class="b l">Je préfère un virement, je te donne mon IBAN</div>
      <div class="b r">Pourquoi pas via l'appli ?</div>
      <div class="b l">Je ne reçois pas les paiements de l'appli</div>
    </div>`),

  // Aucun indice d'auteur : bulles centrées, même style, pas d'avatar. L'IA ne doit pas deviner.
  "conversation-ambigue": page(`
    <div class="top">Conversation <small>Veste · 30 €</small></div>
    <div class="chat">
      <div class="b n">Bonjour, toujours dispo ?</div>
      <div class="b n">Oui</div>
      <div class="b n">Je le prends</div>
      <div class="b n">Ok je l'envoie demain</div>
    </div>`),
};

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
mkdirSync(ici, { recursive: true });
for (const [nom, html] of Object.entries(MAQUETTES)) {
  const p = await contexte.newPage();
  await p.setContent(html);
  await p.screenshot({ path: join(ici, `${nom}.jpg`), type: "jpeg", quality: 82, fullPage: false });
  await p.close();
}
await navigateur.close();
writeFileSync(
  join(ici, "LISEZ-MOI.txt"),
  "Captures fictives générées par generer.mjs (application inventée « ReVente »). Aucune donnée réelle.\n",
);
console.log(`${Object.keys(MAQUETTES).length} captures générées dans ${ici}`);
