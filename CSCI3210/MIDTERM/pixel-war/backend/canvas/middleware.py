import math
from django.http import JsonResponse
from redis.exceptions import RedisError
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .services import cooldown_key, redis_client


class PixelCooldownMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == 'POST' and request.path == '/api/canvases/1/pixels/':
            try:
                result = TokenAuthentication().authenticate(request)
            except AuthenticationFailed:
                result = None
            if result is not None:
                user, _ = result
                try:
                    milliseconds = redis_client.pttl(cooldown_key(user.pk))
                except RedisError:
                    return JsonResponse({'detail': 'Redis is unavailable. Try again shortly.'}, status=503)
                if milliseconds > 0:
                    wait = math.ceil(milliseconds / 1000)
                    response = JsonResponse({'detail': 'Placement cooldown is active.'}, status=429)
                    response['Retry-After'] = str(wait)
                    return response
        return self.get_response(request)
