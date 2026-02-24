# Use Node.js 18 LTS as base image (compatible with canvas@2.11.2)
FROM node:18.20.0

# Set working directory
WORKDIR /app

# Install system dependencies required for canvas and other native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libpixman-1-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libgif-dev \
    libjpeg-dev \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy the rest of the application
COPY . .

# Expose ports (dashboard/website)
EXPOSE 3000 5000

# Start the bot
CMD ["npm", "start"]
