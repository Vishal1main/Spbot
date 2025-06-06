# Use a lightweight official Python image
FROM python:3.9-slim

# Set working directory inside the container
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the full application code
COPY . .

# Expose the port (Render uses $PORT env variable)
EXPOSE 10000

# Run the app using gunicorn
CMD ["gunicorn", "main:app", "--bind", "0.0.0.0:10000"]
