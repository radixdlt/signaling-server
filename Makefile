up:
	docker-compose up --scale signaling-server=2 

up-redis:
	docker-compose -f ./docker-compose.redis.yml

up-prod:
	docker-compose -f ./docker-compose.prod.yml up --build

up-test:
	docker-compose -f ./docker-compose.yml -f ./docker-compose.test.yml up

up-test-build:
	docker-compose -f ./docker-compose.yml -f ./docker-compose.test.yml up -d --build

up-build:
	docker-compose up -d --build

logs:
	docker-compose logs -f --tail 100

down: 
	docker-compose down

down-test: 
	docker-compose -f ./docker-compose.yml -f ./docker-compose.test.yml down

loadtest:
	docker-compose -f ./load-test/docker-compose.yml up --scale worker=4