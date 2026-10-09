# Always-on crawl worker for any container host (Railway, Fly.io, a VPS).
# docker build -t immi-worker worker && docker run --env-file .env immi-worker
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble
WORKDIR /worker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && python -m playwright install chromium
COPY *.py ./
CMD ["python", "crawler.py", "--forever"]
