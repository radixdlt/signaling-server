FROM node:16 as base
ARG BUILDKIT_SBOM_SCAN_STAGE=true

WORKDIR /home/node/app

COPY package.json ./

RUN yarn

COPY . .

FROM base as production
ARG BUILDKIT_SBOM_SCAN_STAGE=true

ENV NODE_PATH=./build

RUN yarn build