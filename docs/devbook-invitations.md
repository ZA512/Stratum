# DevBook – Invitations collaborateur

## 🎯 Objectif
Mettre en place un centre d'invitations pour les partages de tâches (acceptation, refus, suivi des expirations) côté backend et frontend.

## 📦 Livrables majeurs
- API de consultation et d'action sur les invitations reçues.
- Pop-up UI listant les partages entrants avec badge de notification.
- Règles métiers : expiration 30 jours, acceptation = apparition dans le backlog, interdiction de suppression d'une tâche partagée.

## ✅ / 🚧 Checklist de travail

### Backend
- [x] Étendre le schéma Prisma pour tracer les invitations (dates, expéditeur, destinataire, expiration).
	- Migration `20250930220000_node_share_invitations` scaffoldée + génération du client Prisma OK.
- [x] Ajouter services + endpoints NestJS : lister, accepter, refuser, expirer.
	- Nouveaux endpoints REST (`GET/POST /nodes/invitations/...`), logique d’acceptation avec membership et expiration automatique.
- [x] Bloquer la suppression d'une tâche principale si elle a des collaborateurs externes.
	- Suppression root interdite si collaborateurs `DIRECT/INHERITED` ou invitations `PENDING` détectés dans le résumé de partage.
- [ ] Couverture de tests (unitaires/e2e) sur les nouveaux endpoints.

### Frontend
- [x] Clients API pour récupérer / accepter / refuser les invitations.
	- `node-share-invitations-api.ts` fournit fetch/respond avec gestion 401 -> logout.
- [x] Pop-up "Invitations" avec badge dans la topbar (état global, design responsive/a11y).
	- `IncomingInvitationsCenter` (monté dans `boards/[teamId]/layout.tsx`) affiche badge, panneau, close Esc/clic extérieur.
- [ ] Flux d'acceptation : rafraîchir le board / backlog partagé, toasts, erreurs.
	- Toasts + rafraîchissement auto du board actif OK, reste à synchroniser le backlog ciblé (si différent) et maquette UX.
- [x] Désactiver la suppression d'une tâche partagée tout en autorisant la gestion de ses sous-tâches.
	- La modale de suppression affiche désormais un avertissement bloquant si des collaborateurs externes ou invitations PENDING subsistent sur la racine, avec détails et boutons désactivés.

### Ops & Suivi
- [ ] Vérifier le seed pour générer des invitations de démonstration (optionnel à documenter).
- [ ] Mettre à jour la documentation utilisateur si nécessaire.
- [ ] QA manuelle : scénarios invitation expirée, en attente, acceptée, refusée.

---
_Fichier suivi : mettre à jour les cases au fil de l'avancement._
