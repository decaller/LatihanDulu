FROM node:22-slim AS runner

WORKDIR /app

# Copy built application output
COPY .output ./.output

# Set production environment defaults
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# Start Nitro server using Node
CMD ["node", ".output/server/index.mjs"]
