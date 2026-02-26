# Stratum Makefile - common automation
# Usage: make <target>

include .env

COMPOSE = docker compose
FRONTEND_PORT ?= 3000
BACKEND_PORT ?= 4001

.PHONY: help build up up-all down stop logs ps migrate seed backup restore update prune shell-backend shell-db

help:
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?##' Makefile | awk -F':|##' '{printf "\033[36m%-20s\033[0m %s\n", $$1, $$3}'

build: ## (Re)build images (respects .env ARGs)
	$(COMPOSE) build --build-arg NEXT_PUBLIC_API_URL=$(NEXT_PUBLIC_API_URL) backend frontend

up: ## Start postgres then backend + frontend (without nginx)
	$(COMPOSE) up -d postgres
	@sleep 3
	$(COMPOSE) up -d backend
	$(COMPOSE) up -d frontend

up-all: ## Start everything (includes nginx profile if desired)
	$(COMPOSE) --profile nginx up -d postgres backend frontend nginx

stop: ## Stop all services (keeps volumes)
	$(COMPOSE) stop

down: ## Stop + remove containers (keeps volumes)
	$(COMPOSE) down

logs: ## Stream logs for backend & frontend
	$(COMPOSE) logs -f backend frontend

ps: ## List active containers
	$(COMPOSE) ps

migrate: ## Apply Prisma migrations
	$(COMPOSE) exec backend npx prisma migrate deploy

seed: ## Seed demo data
	$(COMPOSE) exec backend npm run db:seed

backup: ## Run backup script (Postgres dump)
	./backup_stratum_pg.sh

restore: ## Restore example (pass FILE=/path/to/dump)
	@if [ -z "$(FILE)" ]; then echo 'Usage: make restore FILE=/path/to/dump' && exit 1; fi
	cat $(FILE) | $(COMPOSE) exec -T postgres pg_restore -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c

update: ## Pull code + rebuild + migrate + restart
	git pull
	$(COMPOSE) build --build-arg NEXT_PUBLIC_API_URL=$(NEXT_PUBLIC_API_URL) backend frontend
	$(COMPOSE) up -d backend
	$(COMPOSE) exec backend npx prisma migrate deploy
	$(COMPOSE) up -d frontend

shell-backend: ## Open a shell in the backend container
	$(COMPOSE) exec backend sh

shell-db: ## Open psql in Postgres
	$(COMPOSE) exec postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

prune: ## Remove dangling images (leaves volumes untouched)
	docker image prune -f
