# Signaling server

## Development Setup

`yarn install`

### Running Docker Containers

_You'll need docker installed on your machine to run this!_

### Build the image

`docker-compose build`

### Start the dev server and Redis instance

`make up`

## Running Tests

`make up-test` - run two local Signaling Server instances and redis instance
`yarn test` - execute tests

## Additional commands

### Build and start dev server

`make up-build`

### Stream logs

`make logs`

### Stop the server

`make down`

### Build and start production build

`make up-prod`
