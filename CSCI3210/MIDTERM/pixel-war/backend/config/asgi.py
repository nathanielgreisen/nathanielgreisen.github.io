import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from django.core.asgi import get_asgi_application
http_application = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.urls import path
from canvas.consumers import CanvasConsumer

application = ProtocolTypeRouter({
    'http': http_application,
    'websocket': OriginValidator(URLRouter([
        path('ws/canvas/1/', CanvasConsumer.as_asgi()),
    ]), settings.WEBSOCKET_ALLOWED_ORIGINS),
})
