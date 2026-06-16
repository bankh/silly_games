# Silly Games — convenience targets
PORT ?= 8000

.PHONY: help serve run docker-build docker-up docker-down docker-logs clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

serve: ## Run locally with the zero-dependency Node server (http://localhost:$(PORT))
	PORT=$(PORT) node serve.js

run: serve ## Alias for `make serve`

# Docker config lives in docs/ (local-only, git-ignored). These shortcuts point at it;
# you can also just `cd docs && docker compose up -d --build`.
COMPOSE = docker compose -f docs/docker-compose.yml

docker-build: ## Build the Docker image
	$(COMPOSE) build

docker-up: ## Build + run in Docker at http://localhost:8080
	$(COMPOSE) up -d --build
	@echo "  🎮 Silly Games → http://localhost:8080"

docker-down: ## Stop and remove the container
	$(COMPOSE) down

docker-logs: ## Tail container logs
	$(COMPOSE) logs -f

clean: ## Remove the Docker image
	-docker rmi silly-games
