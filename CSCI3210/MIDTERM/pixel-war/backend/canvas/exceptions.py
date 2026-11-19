import logging
from django.db import DatabaseError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

log = logging.getLogger(__name__)


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response
    log.error('Unhandled API failure', exc_info=(type(exc), exc, exc.__traceback__))
    if isinstance(exc, DatabaseError):
        return Response({'detail': 'Database is busy or unavailable. Retry shortly.'}, status=503)
    return Response({'detail': 'Unexpected server error. Please try again.'}, status=500)
