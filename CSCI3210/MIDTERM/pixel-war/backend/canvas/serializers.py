from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .models import Canvas, PixelPlacement
from .palette import PALETTE

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ('username', 'password')

        def validate(self, attrs):
            try:
                validate_password(attrs['password'], user=User(username=attrs['username']))
            except DjangoValidationError as exc:
                raise serializers.ValidationError({'password': exc.messages}) from exc
            return attrs



class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class CanvasSerializer(serializers.ModelSerializer):
    can_rename = serializers.SerializerMethodField()

    class Meta:
        model = Canvas
        fields = ('id', 'title', 'width', 'height', 'cooldown_seconds', 'can_rename')

    def get_can_rename(self, canvas):
        user = self.context['request'].user
        return user.is_authenticated and (
            user.is_staff or user in canvas.moderators.all()
        )


class RenameSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=80)


class PlaceSerializer(serializers.Serializer):
    x = serializers.IntegerField(min_value=0)
    y = serializers.IntegerField(min_value=0)
    color = serializers.ChoiceField(choices=PALETTE)

    def validate(self, attrs):
        canvas = self.context['canvas']
        if attrs['x'] >= canvas.width or attrs['y'] >= canvas.height:
            raise serializers.ValidationError('Coordinates are outside this canvas.')
        return attrs


class PlacementSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = PixelPlacement
        fields = ('id', 'username', 'x', 'y', 'color', 'version', 'created_at')
