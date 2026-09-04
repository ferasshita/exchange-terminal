# syntax=docker/dockerfile:1.7

# Use Python 3.14 slim base (Debian-based) for small image size
FROM python:3.14-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# System dependencies for scientific stack and LightGBM (OpenMP)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies first (leveraging Docker layer caching)
COPY forecast_service/requirements.txt ./requirements.txt

# Install wheels only to avoid any source builds
RUN pip install --only-binary=:all: --no-cache-dir -r requirements.txt

# Copy application source
COPY forecast_service/app ./app

# Set the default port; Render will inject PORT env var at runtime
ENV PORT=8000

# Healthcheck (optional; Render also does its own health checks)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,os,sys;url=f'http://127.0.0.1:{os.environ.get('PORT','8000')}/health';\
try:\n r=urllib.request.urlopen(url,timeout=3);sys.exit(0 if r.status==200 else 1)\n\
except Exception:\n sys.exit(1)"

# Default command: start uvicorn
CMD ["/bin/sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
