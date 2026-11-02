import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from django.core.asgi import get_asgi_application
http_application = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.urls import path
from canvas.consumers import CanvasConsumer

application = ProtocolTypeRouter({
    'http': http_application,
    'websocket': AllowedHostsOriginValidator(URLRouter([
        path('ws/canvas/1/', CanvasConsumer.as_asgi()),
    ])),
})
