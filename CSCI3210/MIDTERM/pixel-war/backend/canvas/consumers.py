from channels.generic.websocket import AsyncJsonWebsocketConsumer


class CanvasConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add('canvas.1', self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard('canvas.1', self.channel_name)

    async def receive_json(self, content, **kwargs):
        # All writes must use the authenticated REST endpoint.
        await self.close(code=1008)

    async def pixel_changed(self, event):
        await self.send_json(event['payload'])
