FROM node:22.6.0

RUN apt-get update && apt-get install -y nano

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

CMD ["npm", "run", "start"]
