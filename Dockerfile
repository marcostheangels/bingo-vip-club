FROM node:22-alpine

WORKDIR /app

# Instala dependencias primeiro (cache de camada)
COPY package*.json ./
RUN npm install

# Copia o resto do projeto
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
