FROM node:22-alpine

WORKDIR /app

# Copy package manifests first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose backend port
EXPOSE 4000

# Start command
CMD ["npm", "start"]
