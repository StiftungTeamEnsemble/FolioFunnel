# Create .env from example
cp .env.example .env
# Add your OPENAI_API_KEY to .env

# Start all services
docker-compose up --build

# Access at http://localhost:3000



# Development (with hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Or use npm scripts:
npm run docker:dev          # Start dev environment
npm run docker:dev:logs     # View logs
npm run docker:dev:down     # Stop dev environment

# Production
npm run docker:prod         # Start production
npm run docker:prod:down    # Stop production


---

npm run docker:dev:down
docker volume rm foliofunnel_node_modules
npm run docker:dev


---

 cd "/Users/DATA/TEAM ENSEMBLE/CODE/FolioFunnel" && docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache document-converter