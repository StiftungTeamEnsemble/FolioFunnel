FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install markitdown
RUN pip install --no-cache-dir markitdown flask gunicorn

# Create the API wrapper
COPY server.py /app/server.py

# Optimize memory usage for ML models
ENV PYTORCH_ENABLE_MPS_FALLBACK=0
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128
# Force CPU mode and reduce memory
ENV CUDA_VISIBLE_DEVICES=""
ENV TORCH_HOME=/root/.cache/torch
# Reduce marker batch sizes
ENV MARKER_BATCH_SIZE=1
ENV RECOGNITION_BATCH_SIZE=1

EXPOSE 8080

# Use only 1 worker to avoid loading models multiple times (each ~4GB)
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "600", "--workers", "1", "server:app"]
