FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set PYTHONPATH to include the current directory
ENV PYTHONPATH=/app

CMD ["python", "generator_flow.py"]
