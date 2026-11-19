"""Optional admin creation for free hosting plans without an interactive shell."""
import os
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Create an optional admin from private DJANGO_SUPERUSER_* environment variables.'

    def handle(self, *args, **options):
        username = os.getenv('DJANGO_SUPERUSER_USERNAME', '')
        password = os.getenv('DJANGO_SUPERUSER_PASSWORD', '')
        if not username and not password:
            return
        if not username or not password:
            raise CommandError('Provide both DJANGO_SUPERUSER_USERNAME and DJANGO_SUPERUSER_PASSWORD.')
        User = get_user_model()
        existing = User.objects.filter(username=username).first()
        if existing:
            if not existing.is_superuser:
                raise CommandError('Admin username is already taken. Choose another username.')
            self.stdout.write('Admin already exists; credentials left unchanged.')
            return
        candidate = User(username=username)
        try:
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError('Admin password does not meet Django password requirements.') from exc
        User.objects.create_superuser(username=username, password=password)
        self.stdout.write('Admin account created.')
