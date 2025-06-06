# Base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:10000/ || exit 1

# Expose port
EXPOSE 10000

# Run the application
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000", "--workers", "4"]
