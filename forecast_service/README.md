Forecast Service - Docker & Render Deployment Guide

Overview
This FastAPI microservice provides currency rate forecasts. This guide shows how to run it in Docker locally and how to deploy it to Render using the included render.yaml blueprint.

Prerequisites
- Docker (for local container build/run)
- A Render account (for cloud deployment)

Local development (without Docker)
1) Create a virtual environment with Python 3.14.2 (or the Python version available in your system):
   - Windows (PowerShell):
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
   - macOS/Linux:
     python3 -m venv .venv
     source .venv/bin/activate

2) Install dependencies:
   pip install --only-binary=:all: -r forecast_service/requirements.txt

3) Run the service:
   uvicorn app.main:app --reload --port 8000 --app-dir forecast_service

4) Test the health endpoint:
   curl http://127.0.0.1:8000/health

Running with Docker (locally)
1) Build the image from the repository root:
   docker build -f forecast_service/Dockerfile -t forecast-service:latest .

2) Run the container (port 8000 by default):
   docker run --rm -p 8000:8000 --name forecast-service forecast-service:latest

3) Verify:
   curl http://127.0.0.1:8000/health

Render deployment
This repository includes a render.yaml at the repository root that points Render to the service’s Dockerfile inside the monorepo. The Dockerfile installs only binary wheels to avoid any source builds.

To deploy:
1) Push your repository to GitHub/GitLab.
2) In the Render dashboard, click New > Blueprint and select your repository.
3) Render will read render.yaml and create a Web Service named forecast-service.
4) On first deploy, Render will build the Docker image using forecast_service/Dockerfile and start the service.
5) The service exposes:
   - Healthcheck path: /health
   - App port: uses PORT env var provided by Render (defaults to 8000)

Notes
- The Docker image uses python:3.14-slim and installs libgomp1 for LightGBM runtime.
- Dependencies are installed with --only-binary=:all: to avoid any source compilation.
- The .dockerignore under forecast_service minimizes the build context and speeds up builds.
- Tests: run PowerShell script forecast_service\run_tests.ps1 or run pytest in an active venv.
