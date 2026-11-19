from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from .palette import COLOR_CHOICES


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    next_place_at = models.DateTimeField(null=True, blank=True)


class Canvas(models.Model):
    title = models.CharField(max_length=80, default='Pixel War')
    width = models.PositiveIntegerField(default=100, validators=[
        MinValueValidator(1), MaxValueValidator(1000),
    ])
    height = models.PositiveIntegerField(default=100, validators=[
        MinValueValidator(1), MaxValueValidator(1000),
    ])
    cooldown_seconds = models.PositiveIntegerField(default=5, validators=[
        MinValueValidator(1), MaxValueValidator(300),
    ])
    version = models.PositiveBigIntegerField(default=0)
    moderators = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='moderated_canvases',
    )


class Pixel(models.Model):
    canvas = models.ForeignKey(Canvas, on_delete=models.CASCADE)
    x = models.PositiveIntegerField()
    y = models.PositiveIntegerField()
    color = models.CharField(max_length=7, choices=COLOR_CHOICES)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=['canvas', 'x', 'y'], name='unique_canvas_coordinate',
        )]


class PixelPlacement(models.Model):
    canvas = models.ForeignKey(Canvas, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    x = models.PositiveIntegerField()
    y = models.PositiveIntegerField()
    color = models.CharField(max_length=7, choices=COLOR_CHOICES)
    version = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']
        constraints = [models.UniqueConstraint(
            fields=['canvas', 'version'], name='unique_canvas_version',
        )]
