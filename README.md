# Create .env from example
cp .env.example .env
# Add your OPENAI_API_KEY to .env

# Start all services
docker-compose up --build

# Access at http://localhost:3000