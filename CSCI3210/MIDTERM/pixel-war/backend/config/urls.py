from django.contrib import admin
from django.urls import include, path
from django.http import JsonResponse


def health(request):
    return JsonResponse({'status': 'ok', 'service': 'pixel-war'})

urlpatterns = [
    path('health/', health),
    path('admin/', admin.site.urls),
    path('api/', include('canvas.urls')),
]
