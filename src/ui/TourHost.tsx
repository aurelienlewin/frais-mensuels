import { useMemo, type ReactNode } from 'react';
import { Tour, type TourStep } from './Tour';
import { AccountsSetupPrompt, EssentialBudgetsSetupPrompt } from './OnboardingSetup';
import type { MobileTab } from './MobileTabBar';

// Lazy-loaded (first run / menu → Guide): keeps the tour and its setup prompts out of the main app chunk.
function useTourSteps(setTab: (tab: MobileTab) => void): TourStep[] {
  return useMemo<TourStep[]>(() => {
    const Example = ({ children }: { children: ReactNode }) => (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Exemple</div>
        <div className="mt-1 font-mono text-[12px] text-slate-100">{children}</div>
      </div>
    );

    return [
      {
        id: 'welcome',
        title: 'Bienvenue',
        body: (
          <>
            <p>
              Cette app fonctionne comme un mini-tableur pour suivre tes charges mensuelles (perso + commun) et tes enveloppes.
            </p>
            <Example>Loyer · 1200€ · J05 · Commun · Auto · Viré (virement d&apos;approvisionnement fait)</Example>
            <p className="text-xs text-slate-400">
              Le guide ne s’affiche qu’une fois (tu peux le relancer via le menu <span className="font-mono">⋯</span>).
            </p>
          </>
        ),
      },
      {
        id: 'setup-accounts',
        onEnter: () => setTab('charges'),
        title: 'Configurer tes comptes',
        anchor: 'charges',
        body: (
          <>
            <p>Avant de saisir tes charges, crée/ajuste tes comptes (provenance/destination).</p>
            <AccountsSetupPrompt />
            <p className="text-xs text-slate-400">Tu pourras ensuite les gérer depuis Résumé → Comptes.</p>
          </>
        ),
      },
      {
        id: 'charges',
        onEnter: () => setTab('charges'),
        title: 'Charges mensuelles',
        anchor: 'charges',
        body: (
          <>
            <p>
              Chaque ligne est une charge récurrente du mois. Tu peux éditer le libellé, le jour, le montant, le type
              (perso/commun), l’auto/manuel, et la provenance/destination.
            </p>
            <Example>Internet · 35.99€ · J12 · Commun (50/50) · Auto · JOINT_MAIN</Example>
            <p className="text-xs text-slate-400">
              Tip: coche <span className="font-mono">Viré</span> quand le virement d&apos;approvisionnement est fait (auto se
              marque par défaut si la date est passée).
            </p>
          </>
        ),
      },
      {
        id: 'add',
        onEnter: () => setTab('charges'),
        title: 'Ajouter une charge',
        anchor: 'add-charge',
        body: (
          <>
            <p>
              Clique <span className="font-mono">+ Ajouter</span>, puis complète la ligne. Les modifications sont
              instantanées et sauvegardées.
            </p>
            <Example>Assurance auto · 48€ · J03 · Perso · Auto · PERSONAL_MAIN</Example>
            <p className="text-xs text-slate-400">
              Tu peux réordonner les lignes via drag & drop (ou les flèches sur mobile).
            </p>
          </>
        ),
      },
      {
        id: 'setup-budgets',
        onEnter: () => setTab('budgets'),
        title: 'Créer tes enveloppes',
        anchor: 'budgets',
        body: (
          <>
            <p>Pour l’ajout rapide (perso + essence), crée au moins 2 enveloppes et fixe un montant.</p>
            <EssentialBudgetsSetupPrompt />
          </>
        ),
      },
      {
        id: 'budgets',
        onEnter: () => setTab('budgets'),
        title: 'Enveloppes (budgets)',
        anchor: 'budgets',
        body: (
          <>
            <p>Une enveloppe te donne un montant réservé (ex: perso, essence) et un suivi des dépenses du mois.</p>
            <Example>Budget perso · 200€ → resto 12€ / pharmacie 6€ → reste 182€</Example>
            <p className="text-xs text-slate-400">Les dépenses sont enregistrées en positif (affichées en -€).</p>
          </>
        ),
      },
      {
        id: 'quick-add',
        title: 'Ajout rapide (mobile/desktop)',
        anchor: 'quick-add',
        body: (
          <>
            <p>
              Utilise le widget d’ajout rapide pour saisir une dépense perso ou un plein d’essence en 2 champs.
            </p>
            <Example>⛽ Essence · 55€ (ajouté automatiquement à l’enveloppe)</Example>
            <p className="text-xs text-slate-400">
              Si aucun budget “perso/essence” n’est détecté, l’app te demandera de choisir une enveloppe cible.
            </p>
          </>
        ),
      },
      {
        id: 'summary',
        onEnter: () => setTab('accounts'),
        title: 'Résumé & reste à vivre',
        anchor: 'summary',
        body: (
          <>
            <p>La colonne Résumé agrège tout: charges (commun/perso), enveloppes, reste à vivre, et répartitions.</p>
            <Example>Salaire 3000€ − charges (pour moi) − enveloppes = reste à vivre</Example>
            <p className="text-xs text-slate-400">Tu peux aussi gérer tes comptes (activer/supprimer) depuis le résumé.</p>
          </>
        ),
      },
      {
        id: 'sync',
        title: 'Synchronisation multi-appareils',
        anchor: 'menu',
        body: (
          <>
            <p>
              Les données sont sauvegardées sur l’appareil et synchronisées dans le cloud quand tu es en ligne.
            </p>
            <Example>Menu ⋯ → “Synchroniser (cloud)” → mêmes données sur iOS + desktop</Example>
            <p className="text-xs text-slate-400">
              Tu peux aussi exporter/importer un JSON (sauvegarde) ou exporter un rapport CSV détaillé depuis le menu.
            </p>
          </>
        ),
      },
    ];
  }, []);
}

export default function TourHost({ setTab, onDismiss }: { setTab: (tab: MobileTab) => void; onDismiss: () => void }) {
  const steps = useTourSteps(setTab);
  return <Tour open steps={steps} onDismiss={onDismiss} />;
}
