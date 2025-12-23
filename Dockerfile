# -------- STAGE 1: BUILD --------
FROM node:20 AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# 🔐 Argument injecté par GitHub Actions
ARG VITE_STADIA_API_KEY

# 👉 Exposé à Vite AU BUILD
ENV VITE_STADIA_API_KEY=$VITE_STADIA_API_KEY

RUN npm run build


# -------- STAGE 2: PROD --------
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY ./docs/nginx-react.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
