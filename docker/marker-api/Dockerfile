FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install marker-pdf
RUN pip install --no-cache-dir marker-pdf flask gunicorn

# Create the API wrapper
COPY server.py /app/server.py

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "300", "--workers", "2", "server:app"]
