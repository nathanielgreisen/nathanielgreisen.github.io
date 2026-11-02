from django.contrib.auth import authenticate, get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from .models import Canvas, PixelPlacement, Profile
from .serializers import (
    CanvasSerializer, LoginSerializer, PlaceSerializer,
    PlacementSerializer, RegisterSerializer, RenameSerializer,
)
from . import services

User = get_user_model()


def identity(user):
    profile, _ = Profile.objects.get_or_create(user=user)
    remaining = max(0, (profile.next_place_at - timezone.now()).total_seconds())         if profile.next_place_at else 0
    return {'username': user.username, 'retry_after': remaining}


class AuthViewSet(viewsets.ViewSet):
    @action(detail=False, methods=['post'], permission_classes=[AllowAny],
            authentication_classes=[])
    def register(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                user = User.objects.create_user(**serializer.validated_data)
                Profile.objects.create(user=user)
                token = Token.objects.create(user=user)
        except IntegrityError as exc:
            raise ValidationError({'username': ['This username is already taken.']}) from exc
        return Response({'token': token.key, **identity(user)}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny],
            authentication_classes=[])
    def login(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request, **serializer.validated_data)
        if user is None:
            return Response({'detail': 'Incorrect username or password.'},
                status=status.HTTP_401_UNAUTHORIZED, headers={'WWW-Authenticate': 'Token'})
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, **identity(user)})

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(identity(request.user))

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CanvasViewSet(viewsets.ReadOnlyModelViewSet):
    # One global board for this project; other IDs correctly return 404.
    queryset = Canvas.objects.filter(pk=1).prefetch_related('moderators')
    serializer_class = CanvasSerializer
    permission_classes = [AllowAny]

    @action(detail=True, methods=['get'])
    def snapshot(self, request, pk=None):
        canvas = self.get_object()
        return Response(services.snapshot(canvas.pk))

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def pixels(self, request, pk=None):
        canvas = self.get_object()
        serializer = PlaceSerializer(data=request.data, context={'canvas': canvas})
        serializer.is_valid(raise_exception=True)
        result = services.place_pixel(canvas.pk, request.user, **serializer.validated_data)
        return Response(result, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        canvas = self.get_object()
        events = PixelPlacement.objects.filter(canvas=canvas).select_related('user')[:50]
        return Response(PlacementSerializer(events, many=True).data)

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated])
    def rename(self, request, pk=None):
        canvas = self.get_object()
        if not (request.user.is_staff or request.user in canvas.moderators.all()):
            raise PermissionDenied('Only staff and canvas moderators may rename this canvas.')
        serializer = RenameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        canvas.title = serializer.validated_data['title']
        canvas.save(update_fields=['title'])
        return Response(self.get_serializer(canvas).data)
