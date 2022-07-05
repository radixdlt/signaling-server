up:
	docker-compose up -d

up-test:
	docker-compose -f ./docker-compose.yml -f ./docker-compose.test.yml up -d 

up-test-build:
	docker-compose -f ./docker-compose.yml -f ./docker-compose.test.yml up -d --build

up-build:
	docker-compose up -d --build

logs:
	docker-compose logs -f

down: 
	docker-compose down

down-test: 
	docker-compose -f ./docker-compose.yml -f ./docker-compose.test.yml down