from rest_framework.routers import DefaultRouter
from .views import AuthViewSet, CanvasViewSet

router = DefaultRouter()
router.register('auth', AuthViewSet, basename='auth')
router.register('canvases', CanvasViewSet, basename='canvas')
urlpatterns = router.urls
