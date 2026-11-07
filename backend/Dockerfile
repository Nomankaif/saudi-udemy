FROM node:22-alpine
RUN apk add --no-cache python3 \
    && python3 -c 'import sys; assert sys.version_info >= (3, 12), sys.version'
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src ./src
COPY backend/assets ./assets
EXPOSE 4000
CMD ["npm", "start"]
