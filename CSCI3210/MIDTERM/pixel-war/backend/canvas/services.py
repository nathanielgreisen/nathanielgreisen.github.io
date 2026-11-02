from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled
from .models import Canvas, Pixel, PixelPlacement, Profile


def snapshot(canvas_id):
    canvas = Canvas.objects.get(pk=canvas_id)
    pixels = list(Pixel.objects.filter(canvas=canvas).values('x', 'y', 'color'))
    return {'width': canvas.width, 'height': canvas.height,
            'version': canvas.version, 'pixels': pixels}


def place_pixel(canvas_id, user, x, y, color):
    with transaction.atomic():
        canvas = Canvas.objects.get(pk=canvas_id)
        profile, _ = Profile.objects.get_or_create(user=user)
        now = timezone.now()
        if profile.next_place_at and profile.next_place_at > now:
            raise Throttled(wait=(profile.next_place_at - now).total_seconds())
        Pixel.objects.update_or_create(
            canvas=canvas, x=x, y=y, defaults={'color': color},
        )
        canvas.version += 1
        canvas.save(update_fields=['version'])
        PixelPlacement.objects.create(
            canvas=canvas, user=user, x=x, y=y, color=color, version=canvas.version,
        )
        profile.next_place_at = now + timedelta(seconds=canvas.cooldown_seconds)
        profile.save(update_fields=['next_place_at'])
        event = {'type': 'pixel', 'x': x, 'y': y, 'color': color,
                 'version': canvas.version, 'username': user.username}
    return {'event': event, 'retry_after': canvas.cooldown_seconds, 'realtime': False}
