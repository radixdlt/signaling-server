ARG BUILDKIT_SBOM_SCAN_CONTEXT=true

FROM node:16 as base
ARG BUILDKIT_SBOM_SCAN_STAGE=true

WORKDIR /home/node/app

COPY package.json ./

RUN yarn

COPY . .

FROM base as production

ENV NODE_PATH=./build

RUN yarn build