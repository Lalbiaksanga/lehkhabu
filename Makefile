.PHONY: install dev dev-user dev-admin dev-ai

install:
	cd frontend-user && npm install --legacy-peer-deps
	cd frontend-admin && npm install
	cd shared && npm install
	cd backend-ai && pip install -r requirements.txt

dev-user:
	cd frontend-user && npm run dev

dev-admin:
	cd frontend-admin && npm run dev

dev-ai:
	cd backend-ai && uvicorn main:app --reload --port 8001

dev:
	make dev-user & make dev-admin & make dev-ai