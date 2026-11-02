from django.core.management.base import BaseCommand
from canvas.models import Canvas


class Command(BaseCommand):
    help = 'Create canvas 1 if it does not exist; never erase an existing board.'

    def handle(self, *args, **options):
        canvas, created = Canvas.objects.get_or_create(pk=1)
        self.stdout.write(f'Canvas {canvas.pk}: {"created" if created else "already exists"}')
