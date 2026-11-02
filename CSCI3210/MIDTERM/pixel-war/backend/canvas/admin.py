from django.contrib import admin
from .models import Canvas, PixelPlacement, Profile


@admin.register(Canvas)
class CanvasAdmin(admin.ModelAdmin):
    fields = ('title', 'moderators')
    filter_horizontal = ('moderators',)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PixelPlacement)
class PlacementAdmin(admin.ModelAdmin):
    list_display = ('version', 'canvas', 'user', 'x', 'y', 'color', 'created_at')
    list_select_related = ('canvas', 'user')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'next_place_at')
    readonly_fields = ('user', 'next_place_at')

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
