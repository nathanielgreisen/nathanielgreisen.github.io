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
        if request.method != 'POST' or request.path != '/api/canvases/1/pixels/':
            return self.get_response(request)

        try:
            credentials = TokenAuthentication().authenticate(request)
        except AuthenticationFailed:
            credentials = None
        if credentials is None:
            return self.get_response(request)

        user, _ = credentials
        try:
            milliseconds = redis_client.pttl(cooldown_key(user.pk))
        except RedisError:
            return JsonResponse({'detail': 'Redis is unavailable. Try again shortly.'}, status=503)
        if milliseconds <= 0:
            return self.get_response(request)

        response = JsonResponse({'detail': 'Placement cooldown is active.'}, status=429)
        response['Retry-After'] = str(math.ceil(milliseconds / 1000))
        return response
