from locust import HttpUser, TaskSet, task, between, events
from websocket import create_connection
import time
import json
import gevent
from uuid import uuid4

class UserBehavior(TaskSet):   
    def on_start(self):
        self.ws = create_connection("ws://signaling-server:4000")

        def _receive():
            while True:
                res = self.ws.recv()
                data = json.loads(res)
                end_at = time.time()

                if 'valid' in data.keys():
                    response_time = int((end_at - data['valid']['startAt']) * 1000)
                    events.request_success.fire(
                        request_type='WebSocket',
                        name='test/ws/receive',
                        response_time=response_time,
                        response_length=len(res),
                    )
                

        gevent.spawn(_receive)
        
    def on_quit(self):
        self.ws.close()
        
    @task(1)
    def say_hello(self):
        start_at = time.time()
        
        body = {
            "encryptedPayload": "8090be8fad3f11789665bd74d6b03fe42f99d35fc8d045ac319400e25137ec9f2c834e612333519fd32a6300d058f613059dceca4c0464b25ad9cf467ca23c15d0dca5aad5e650aec08c394880139e6d61cd751ae743e1d4161bcf6b0a583d43569bb35d09464f36fff3b1af229741c3435818dd56e24559b0ec425df9d252124b99a02e7468ed74cf85ae090d27dd5edb4b50add1c575bfb309e3990e367b787bfd388abcaf3dc3751b5c6922b0a3190b1f1dabde788f911d532a6560f6d074cab9a3", 
            "connectionId": str(uuid4()), 
            "method": "iceCandidate", 
            "source": "iOS", 
            "requestId": "AD10B2D9-7EFD-4096-A931-455A416D87B9",
            "startAt": start_at
        }

        self.ws.send(json.dumps(body))


        
class WebsiteUser(HttpUser):
    tasks = [UserBehavior]
    wait_time = between(1, 1)