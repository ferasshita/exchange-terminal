from __future__ import annotations

import os
import sys
from typing import Generator

import pytest
from fastapi.testclient import TestClient

# Ensure `app` package (forecast_service/app) is importable when running tests from this folder
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.main import app  # noqa: E402  (import after sys.path modification)


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c
