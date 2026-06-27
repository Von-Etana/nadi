FROM node:18-alpine

WORKDIR /app

# Copy backend package files
COPY nadi-backend/package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy backend source code
COPY nadi-backend/ .

# Expose port (default is 5000 for Nadi backend)
EXPOSE 5000

# Start server
CMD ["node", "src/server.js"]
