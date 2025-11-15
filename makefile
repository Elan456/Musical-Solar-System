.PHONY: backend
.PHONY: frontend

backend: 
	cd backend && python -m uvicorn main:app --reload
frontend:
	cd frontend && pnpm dev
setup:
	sudo pacman -Syu
	sudo pacman -S pnpm 
	pnpm -v
	pip install . 
	