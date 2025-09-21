# Stratum - Breadcrumb fractal

## 1. Objectifs UX
- Indiquer en permanence la position exacte dans la hierarchie fractale (Projet > Tache > Sous-tache ...).
- Permettre un retour rapide a n'importe quel niveau sans ouvrir de menu.
- Donner une perception visuelle de profondeur et du chemin parcouru.
- Rester discret pour ne pas encombrer l'ecran principal du board.

## 2. Structure visuelle
- Position fixe en haut a gauche, zone 280x48px max sur desktop, 100% largeur sur mobile.
- Empilement de bandes fines (hauteur 24px desktop / 20px mobile) avec leger decalage et opacite decroissante.
- Bande exterieure (niveau racine) : couleur derivee du theme du board parent.
- Bandes internes : generation automatique par interpolation de couleur (HSL) pour suggerer profondeur.
- Texte : nom du node + icone type (S = simple, M = moyenne, K = sous-kanban) + badge count si notifications.

## 3. Comportement interactif
- Survol desktop : accentuation (opacite 1, bordure fine) et affichage tooltip du chemin complet.
- Clic ou tap : navigation immediate vers le board associe. Transition ascendante via Framer Motion (scale + translateY).
- Long press mobile : menu contextuel (ouvrir dans nouvelle vue, voir details node).
- Nom trop long : ellipsis + tooltip ou tap secondaire pour afficher complet.

## 4. Etats et transitions
- Entree : descente dans un sous-kanban -> animation slide-left des bandes existantes + fade-in de la nouvelle bande interne (220 ms, easeOut).
- Sortie : retour niveau superieur -> slide-right + scale down de la bande supprimee (180 ms).
- Etat actif : bande la plus interne (niveau courant) legerement plus epaisse, bord superieur accentue.
- Focus clavier : outline 2px theme primaire, navigation possible avec Tab puis fleches gauche/droite.

## 5. Accessibilite
- Role ARIA navigation avec liste ordonnee (ol > li > button).
- Annonce screen reader : "Niveau 3 sur 4: Tache API Gateway".
- Contraste : texte >= 4.5, elements secondaires >= 3.
- Focus visuel synchronise avec transitions (motion div + gestion FocusVisible).

## 6. Etats speciaux
- Homonymes : tooltip affiche chemin complet (ex: Projet B / Tache 1 / Tache 1).
- Breadcrumb profond (>8 niveaux) : mode compact -> regrouper niveaux intermediaires dans popover ... tout en conservant code couleur.
- Mode presentation (affichage ecran) : bande repliable sur hover, auto-hide apres 4s d'inactivite.

## 7. Implementation technique
- Composant React nomme FractalBreadcrumb base sur layout grid + framer-motion.
- Etat derive du chemin courant nodePath via React Query (API GET /nodes/{id}/path).
- Palette de couleurs memoisee (hash nodeId) pour stabilite.
- Gestion responsive via hook useMediaQuery pour bascule mode compact < 768px.
- Tests : Storybook pour cas multiples, RTL pour navigation clavier, captures visuelles pour regression theme.

