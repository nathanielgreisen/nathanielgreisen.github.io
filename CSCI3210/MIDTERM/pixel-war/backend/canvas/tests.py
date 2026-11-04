import os
from unittest.mock import AsyncMock, patch
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, SimpleTestCase, override_settings
from rest_framework.authtoken.models import Token
from config.asgi import application
from . import services
from .models import Canvas, PixelPlacement

PAGES_ORIGIN = 'https://nathanielgreisen.github.io'


class DeploymentApiTests(TestCase):
    def test_leaderboard_counts_all_placements_and_limits_results(self):
        board = Canvas.objects.create(pk=1)
        other_board = Canvas.objects.create(pk=2)
        user_model = get_user_model()
        users = [user_model.objects.create(username=f'player{i:02}') for i in range(11)]
        placements = [
            PixelPlacement(canvas=board, user=users[0], x=0, y=0,
                           color='#FF4500', version=version)
            for version in range(1, 61)
        ]
        placements.extend(
            PixelPlacement(canvas=board, user=user, x=0, y=0,
                           color='#FF4500', version=version)
            for version, user in enumerate(users[1:], start=61)
        )
        placements.append(PixelPlacement(canvas=other_board, user=users[-1],
                                         x=0, y=0, color='#FF4500', version=1))
        PixelPlacement.objects.bulk_create(placements)

        response = self.client.get('/api/canvases/1/leaderboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [
            {'username': 'player00', 'placements': 60},
            *[{'username': user.username, 'placements': 1} for user in users[1:10]],
        ])

    def test_health_is_public(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ok')

    def test_pages_origin_can_read_api_and_errors(self):
        Canvas.objects.create(pk=1)
        for path, expected in [('/api/canvases/1/', 200), ('/api/canvases/999/', 404)]:
            response = self.client.get(path, HTTP_ORIGIN=PAGES_ORIGIN)
            self.assertEqual(response.status_code, expected)
            self.assertEqual(response['Access-Control-Allow-Origin'], PAGES_ORIGIN)

    def test_token_preflight_is_allowed_for_pages(self):
        response = self.client.options(
            '/api/canvases/1/pixels/', HTTP_ORIGIN=PAGES_ORIGIN,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Access-Control-Allow-Origin'], PAGES_ORIGIN)
        self.assertIn('authorization', response['Access-Control-Allow-Headers'])

    def test_unknown_origin_has_no_cors_permission(self):
        response = self.client.get('/api/canvases/999/', HTTP_ORIGIN='https://other.example')
        self.assertNotIn('Access-Control-Allow-Origin', response)

    def test_cooldown_header_is_visible_across_origins(self):
        user = get_user_model().objects.create_user('cooldown', password='Practice-Canvas42!')
        token = Token.objects.create(user=user)
        with patch.object(services.redis_client, 'pttl', return_value=4500):
            response = self.client.post(
                '/api/canvases/1/pixels/', data={}, content_type='application/json',
                HTTP_ORIGIN=PAGES_ORIGIN, HTTP_AUTHORIZATION=f'Token {token.key}',
            )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response['Retry-After'], '5')
        self.assertIn('Retry-After', response['Access-Control-Expose-Headers'])
        self.assertEqual(response['Access-Control-Allow-Origin'], PAGES_ORIGIN)

    def test_weak_registration_password_is_rejected(self):
        response = self.client.post('/api/auth/register/',
            data={'username': 'learner', 'password': '123'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.json())
        self.assertFalse(get_user_model().objects.filter(username='learner').exists())

    def test_optional_admin_is_created_once_without_resetting_password(self):
        with patch.dict(os.environ, {
            'DJANGO_SUPERUSER_USERNAME': 'hosted_admin',
            'DJANGO_SUPERUSER_PASSWORD': 'Hosted-Canvas-Practice42!',
        }):
            call_command('bootstrap_admin', verbosity=0)
            user = get_user_model().objects.get(username='hosted_admin')
            self.assertTrue(user.is_superuser)
            original_hash = user.password
            call_command('bootstrap_admin', verbosity=0)
            user.refresh_from_db()
            self.assertEqual(user.password, original_hash)

    def test_admin_bootstrap_will_not_promote_an_existing_ordinary_account(self):
        user = get_user_model().objects.create_user('already_taken')
        with patch.dict(os.environ, {
            'DJANGO_SUPERUSER_USERNAME': 'already_taken',
            'DJANGO_SUPERUSER_PASSWORD': 'Hosted-Canvas-Practice42!',
        }), self.assertRaises(CommandError):
            call_command('bootstrap_admin')
        user.refresh_from_db()
        self.assertFalse(user.is_superuser)


class BroadcastTests(SimpleTestCase):
    def test_saved_event_is_published_to_the_canvas_group(self):
        event = {'type': 'pixel', 'x': 1, 'y': 2, 'color': '#FF4500', 'version': 1}
        send = AsyncMock()
        with patch('canvas.services.get_channel_layer') as get_layer:
            get_layer.return_value.group_send = send
            self.assertTrue(services.publish(event))
        send.assert_awaited_once_with('canvas.1', {'type': 'pixel.changed', 'payload': event})

    def test_broadcast_failure_does_not_fail_a_committed_placement(self):
        with patch('canvas.services.get_channel_layer', side_effect=RuntimeError('offline')):
            self.assertFalse(services.publish({}))


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class SocketOriginTests(SimpleTestCase):
    def test_pages_origin_receives_events(self):
        async def scenario():
            socket = WebsocketCommunicator(application, '/ws/canvas/1/',
                headers=[(b'origin', PAGES_ORIGIN.encode())])
            connected, _ = await socket.connect()
            self.assertTrue(connected)
            event = {'type': 'pixel', 'x': 1, 'y': 2, 'color': '#FF4500', 'version': 1}
            await get_channel_layer().group_send('canvas.1',
                {'type': 'pixel.changed', 'payload': event})
            self.assertEqual(await socket.receive_json_from(), event)
            await socket.send_json_to({'x': 1, 'y': 1})
            self.assertEqual((await socket.receive_output())['code'], 1008)
            await socket.disconnect()
        async_to_sync(scenario)()

    def test_other_origin_is_rejected(self):
        async def scenario():
            socket = WebsocketCommunicator(application, '/ws/canvas/1/',
                headers=[(b'origin', b'https://other.example')])
            connected, _ = await socket.connect()
            self.assertFalse(connected)
            await socket.disconnect()
        async_to_sync(scenario)()
