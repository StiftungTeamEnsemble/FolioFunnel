FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install markitdown with PDF support and pymupdf4llm
RUN pip install --no-cache-dir "markitdown[pdf]" pymupdf4llm flask gunicorn

COPY server.py /app/server.py

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "300", "--workers", "2", "server:app"]
