# Stratum Makefile - automatisation courante
# Utilisation: make <cible>

include .env

COMPOSE = docker compose
FRONTEND_PORT ?= 3000
BACKEND_PORT ?= 4001

.PHONY: help build up up-all down stop logs ps migrate seed backup restore update prune shell-backend shell-db

help:
	@echo 'Cibles disponibles:'
	@grep -E '^[a-zA-Z_-]+:.*?##' Makefile | awk -F':|##' '{printf "\033[36m%-20s\033[0m %s\n", $$1, $$3}'

build: ## (Re)build images (respecte les ARG .env)
	$(COMPOSE) build --build-arg NEXT_PUBLIC_API_URL=$(NEXT_PUBLIC_API_URL) backend frontend

up: ## Démarre postgres puis backend + frontend (sans nginx)
	$(COMPOSE) up -d postgres
	@sleep 3
	$(COMPOSE) up -d backend
	$(COMPOSE) up -d frontend

up-all: ## Démarre tout (inclut profil nginx si souhaité)
	$(COMPOSE) --profile nginx up -d postgres backend frontend nginx

stop: ## Stop tous les services (conserve volumes)
	$(COMPOSE) stop

down: ## Stop + retire containers (garde volumes)
	$(COMPOSE) down

logs: ## Affiche logs suivis backend & frontend
	$(COMPOSE) logs -f backend frontend

ps: ## Liste les containers actifs
	$(COMPOSE) ps

migrate: ## Applique migrations Prisma
	$(COMPOSE) exec backend npx prisma migrate deploy

seed: ## Seed données de démo
	$(COMPOSE) exec backend npm run db:seed

backup: ## Lance script de sauvegarde (dump Postgres)
	./backup_stratum_pg.sh

restore: ## Exemple restauration (VARIABLE FILE=chemin dump)
	@if [ -z "$(FILE)" ]; then echo 'Usage: make restore FILE=/chemin/dump' && exit 1; fi
	cat $(FILE) | $(COMPOSE) exec -T postgres pg_restore -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c

update: ## Pull code + rebuild + migrations + restart
	git pull
	$(COMPOSE) build --build-arg NEXT_PUBLIC_API_URL=$(NEXT_PUBLIC_API_URL) backend frontend
	$(COMPOSE) up -d backend
	$(COMPOSE) exec backend npx prisma migrate deploy
	$(COMPOSE) up -d frontend

shell-backend: ## Shell dans le container backend
	$(COMPOSE) exec backend sh

shell-db: ## psql dans Postgres
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

prune: ## Nettoyage images dangling (sans toucher volumes)
	docker image prune -f
