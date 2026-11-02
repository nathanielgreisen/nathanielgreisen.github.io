import logging
import math
from contextlib import contextmanager
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from redis import Redis
from redis.exceptions import RedisError
from rest_framework.exceptions import APIException, Throttled
from .models import Canvas, Pixel, PixelPlacement, Profile
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

log = logging.getLogger(__name__)
redis_client = Redis.from_url(
    settings.REDIS_URL, decode_responses=True,
    socket_connect_timeout=2, socket_timeout=2,
)


class Unavailable(APIException):
    status_code = 503
    default_detail = 'Canvas service is busy or unavailable. Please retry shortly.'


def cooldown_key(user_id):
    return f'pixel-war:cooldown:{user_id}'


def cache_key(canvas_id):
    return f'pixel-war:canvas:{canvas_id}'


@contextmanager
def board_lock(canvas_id):
    # All placement writers for this single-board demo use this same lock.
    lock = redis_client.lock(f'pixel-war:lock:{canvas_id}', timeout=30, blocking_timeout=3)
    try:
        acquired = lock.acquire()
    except RedisError as exc:
        raise Unavailable() from exc
    if not acquired:
        raise Unavailable()
    try:
        yield
    finally:
        try:
            lock.release()
        except RedisError:
            # A committed SQL write must not become a misleading failed placement.
            log.exception('Could not release canvas lock; its lease will expire.')


def snapshot(canvas_id):
    with board_lock(canvas_id):
        canvas = Canvas.objects.get(pk=canvas_id)
        try:
            cached = redis_client.hgetall(cache_key(canvas_id))
            if cached.get('_version') != str(canvas.version):
                pixels = list(Pixel.objects.filter(canvas=canvas).values('x', 'y', 'color'))
                cached = {f"{p['x']},{p['y']}": p['color'] for p in pixels}
                cached['_version'] = str(canvas.version)
                with redis_client.pipeline(transaction=True) as pipe:
                    pipe.delete(cache_key(canvas_id))
                    pipe.hset(cache_key(canvas_id), mapping=cached)
                    pipe.execute()
            pixels = []
            for coordinate, color in cached.items():
                if coordinate == '_version':
                    continue
                x, y = map(int, coordinate.split(','))
                pixels.append({'x': x, 'y': y, 'color': color})
            return {'width': canvas.width, 'height': canvas.height,
                    'version': canvas.version, 'pixels': pixels}
        except RedisError as exc:
            raise Unavailable() from exc


def publish(event):
    try:
        async_to_sync(get_channel_layer().group_send)(
            'canvas.1', {'type': 'pixel.changed', 'payload': event},
        )
        return True
    except Exception:
        # The SQL transaction already committed. Clients will resync.
        log.exception('Placement saved; broadcast failed.')
        return False


def place_pixel(canvas_id, user, x, y, color):
    with board_lock(canvas_id):
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
        # SQL has committed. Never report this saved placement as failed merely
        # because a cache refresh or live notification failed afterward.
        try:
            previous = redis_client.hget(cache_key(canvas_id), '_version')
            if previous == str(canvas.version - 1):
                redis_client.hset(cache_key(canvas_id), mapping={
                    f'{x},{y}': color, '_version': str(canvas.version),
                })
            else:
                # A partial/missing/stale cache must be rebuilt from SQL.
                redis_client.delete(cache_key(canvas_id))
            milliseconds = max(1, math.ceil(
                (profile.next_place_at - timezone.now()).total_seconds() * 1000,
            ))
            redis_client.psetex(cooldown_key(user.pk), milliseconds, '1')
        except RedisError:
            log.exception('Placement saved; cache update failed. Snapshot will reconcile.')
        realtime = publish(event)
        return {'event': event, 'retry_after': canvas.cooldown_seconds, 'realtime': realtime}
