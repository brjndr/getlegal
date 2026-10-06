# Builds the frontend into static files.
FROM node:24-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The build reads the agreement text from ../templates and the documents from ../documents.
COPY templates/ /build/templates/
COPY documents/ /build/documents/
RUN npm run build

# Runs the backend, which also serves the built frontend.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/app/ ./app/
# The documents the chat can draft, which the frontend build reads as well.
COPY documents/ ./documents/
ENV SPECS_PATH=/app/documents/specs.json
COPY --from=frontend /build/frontend/out/ ./static/
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
