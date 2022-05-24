up:
	docker-compose up -d

up-build:
	docker-compose up -d --build

logs:
	docker-compose logs -f

down: 
	docker-compose down