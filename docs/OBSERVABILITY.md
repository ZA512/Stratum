# Observabilité Stratum (Metrics / Monitoring)

## 1. Objectifs
Offrir une visibilité opérationnelle de niveau SaaS (performance, erreurs, saturation, santé sauvegardes) avec coût contrôlé.

Principes :
- Opt‑in (`METRICS_ENABLED=true`).
- Cardinalité maîtrisée (pas d’IDs utilisateurs/équipes en labels → agrégations globales seulement).
- Surcoût limité via sampling HTTP configurable.
- Mesures périodiques (snapshots) pour dériver des tendances métier simples.

## 2. Variables d’environnement clés
| Variable | Valeur par défaut | Rôle |
|----------|-------------------|------|
| METRICS_ENABLED | false | Active tout le pipeline d’instrumentation |
| METRICS_HTTP_SAMPLE_RATE | 1 | Fraction (0<r≤1) de requêtes dont on enregistre la durée/compteurs |
| METRICS_ENTITY_SNAPSHOT_INTERVAL_MS | 15000 | Intervalle collecte gauges métier (nodes, tokens, backups) |
| METRICS_BACKUP_AGE_ENABLED | false | Active la gauge âge du backup récent |
| METRICS_EVENT_LOOP_INTERVAL_MS | 5000 | Fréquence de mesure du lag event loop |
| BACKUP_DIR | /opt/stratum_backups | Répertoire scanné pour calcul âge dernier dump |

Activer :
```
METRICS_ENABLED=true
```
Optionnel (exemple sampling 20%) :
```
METRICS_HTTP_SAMPLE_RATE=0.2
```

## 3. Endpoints & exposition
- Endpoint Prometheus : `GET /metrics` (backend Nest). Retourne un message si désactivé.
- Préfixe commun : `stratum_` (y compris les métriques runtime Node par `collectDefaultMetrics`).

Test local :
```
curl http://localhost:4001/metrics | head
```

## 4. Démarrer la stack d’observabilité
```
docker compose build
make up
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d prometheus grafana postgres-exporter
```
Accès :
- Prometheus : http://localhost:${PROMETHEUS_PORT:-9090}
- Grafana : http://localhost:${GRAFANA_PORT:-3100} (admin / admin)

Provisioning : un dashboard Overview et la datasource Prometheus sont chargés automatiquement (répertoire `grafana/provisioning`).

## 5. Métriques exposées (principales)
| Nom | Type | Labels | Description |
|-----|------|--------|-------------|
| stratum_http_requests_total | Counter | method, route, status | Requêtes HTTP (échantillonnées si sample <1) |
| stratum_http_request_duration_seconds | Histogram | method, route, status | Latence HTTP buckets (échantillonnée) |
| stratum_http_errors_total | Counter | method, route | Réponses 5xx |
| stratum_prisma_queries_total | Counter | model, action, status | Volume requêtes ORM |
| stratum_prisma_query_duration_seconds | Histogram | model, action, status | Latence requêtes DB |
| stratum_prisma_errors_total | Counter | model, action, error | Erreurs catégorisées (ex: P2002) |
| stratum_nodes_total | Gauge | – | Total de nodes (snapshot) |
| stratum_nodes_blocked_total | Gauge | – | Nodes bloqués non résolus |
| stratum_refresh_tokens_active | Gauge | – | Tokens refresh actifs |
| stratum_backup_age_seconds | Gauge | – | Âge du dernier dump (si METRICS_BACKUP_AGE_ENABLED=true) |
| stratum_event_loop_lag_seconds | Gauge | phase | Lag event loop (phase=max) |
| stratum_active_users_placeholder | Gauge | – | Réservé future impl. utilisateurs actifs |
| stratum_process_* / stratum_nodejs_* | Divers | runtime | Métriques Node.js standard (CPU, heap, GC…) |

Remarque sampling : si `METRICS_HTTP_SAMPLE_RATE=0.2`, les requêtes non échantillonnées ne modifient pas les histogrammes ni compteurs HTTP; interpréter les taux en conséquence (extrapolation linéaire possible). Les métriques Prisma & gauges ne sont pas échantillonnées.

## 6. Alerting (Prometheus)
Fichier : `prometheus-rules.yml` monté dans Prometheus.

| Alerte | Expression (résumé) | Seuil / Délai | Gravité | Intention |
|--------|---------------------|---------------|---------|-----------|
| HighErrorRate | increase(errors)/increase(req) > 5% | 5m/for 5m | warning | Détecter dérive qualité API |
| HighLatencyP95 | p95 HTTP > 0.5s | 10m | warning | Saturation lente continue |
| PrismaErrorsSpike | increase(prisma_errors_total[5m]) > 20 | 5m | warning | Montée en erreurs DB |
| BackupStale | backup_age_seconds > 86400 | 60m | critical | Manque de backup < 24h |
| EventLoopLag | event_loop_lag_seconds > 0.2 | 10m | warning | Saturation CPU / blocage Node |

Intégration notification (Slack, Email, Webhook) non encore câblée : à traiter via Alertmanager (prochain jalon) ou Grafana unified alerting.

## 7. Dashboard Grafana provisionné
Fichier JSON : `grafana/provisioning/dashboards/json/stratum-overview.json`.
Panels principaux :
- Stat: Error Rate 5m, HTTP P95, Prisma P95, Backup Age.
- Graphiques: Requests/s, Error Rate, Event Loop Lag, Nodes Total vs Blocked, Refresh Tokens actifs.

Refresh par défaut : 30s, fenêtre 6h.

## 8. Sécurité & Bonnes pratiques
- Ne jamais exposer `/metrics` directement à Internet (limiter par réseau interne ou reverse proxy + auth basique).
- Modifier immédiatement le mot de passe admin Grafana.
- Limiter rétention TSDB (actuellement 15j réglé via argument).
- Surveiller cardinalité des labels route → éviter explosion (préférer patterns Nest normalisés sans IDs dynamiques).
- Mettre en pause METRICS_ENABLED si environnement de test jetable pour accélérer démarrage.

## 9. Test de restauration automatisé
Script : `scripts/test_restore.sh <dump_file>`
- Spin‑up d’une instance Postgres éphémère.
- Import du dump puis contrôle présence migrations.
- Logge le résultat; n’affecte pas la base courante.

Exemple cron hebdo :
```
0 3 * * 0 /chemin/vers/scripts/test_restore.sh $(ls -1t /opt/stratum_backups/stratum_*.dump | head -n1) >> /opt/stratum_backups/restore_check.log 2>&1
```

## 10. Roadmap Observabilité (révisée)
| Élément | Type | Statut | Note |
|---------|------|--------|------|
| Gauge nodes / blocked | Metric | FAIT | Déployé (snapshot périodique) |
| Refresh tokens actifs | Metric | FAIT | Suivi stock tokens |
| Backup age + alerte | Metric+Alert | FAIT | Guardrail backup 24h |
| Event loop lag | Metric+Alert | FAIT | Détection saturation CPU/blocage |
| Dashboard Overview | Dashboard | FAIT | Provisionné automatiquement |
| Alerte erreurs & latence | Alert | FAIT | Prometheus rules |
| Traces distribuées (OTel) | Tracing | À faire | Ajout SDK OTel + exporter OTLP |
| Taille réponses HTTP | Metric | À évaluer | Ajouter histogramme payload (risque overhead) |
| Active users réel | Metric | À faire | Impl logique (sessions / derniers events) |
| Job / worker metrics | Metric | À faire | Quand un worker background sera ajouté |
| Alert routing (Slack) | Ops | À faire | Config Alertmanager + secret management |
| SLO & Error Budget | Process | À faire | Définir objectifs p95, taux erreur mensuel |
| Multi‑tenant dims | Design | À évaluer | Stratégie future (labels contrôlés / cardinalité) |

## 11. Désactivation complète
1. Arrêter services observabilité :
```
docker compose stop prometheus grafana postgres-exporter
```
2. Mettre `METRICS_ENABLED=false` dans `.env`.
3. Redémarrer backend → endpoint `/metrics` devient no‑op.

## 12. Points techniques internes
- Le collecteur métier ouvre actuellement un `PrismaClient` lazy. Optimisation prochaine : réutiliser l’instance Nest pour réduire connexions simultanées.
- Sampling HTTP appliqué avant incrément des compteurs et histogrammes pour cohérence (pas d’échantillonnage partiel durée vs volume).
- Buckets latence calibrés pour trafic web interactif (adapter si usage batch / streaming).

---
Fin.
