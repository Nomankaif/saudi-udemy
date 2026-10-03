FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src ./src
EXPOSE 4000
CMD ["npm", "start"]
