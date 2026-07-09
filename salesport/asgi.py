import os
from django.core.asgi import get_asgi_application
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "salesport.settings")
django_asgi_app = get_asgi_application()

# Socket.IO mounted alongside Django's own ASGI app — HTTP/DRF traffic goes
# to django_asgi_app unchanged; anything under /socket.io/ is handled by the
# realtime server (crm/sockets.py). Importing sockets AFTER
# get_asgi_application() ensures Django's app registry is ready first, since
# sockets.py touches models via deferred imports.
import socketio  # noqa: E402
from crm.sockets import sio  # noqa: E402

application = socketio.ASGIApp(sio, other_asgi_app=django_asgi_app, socketio_path="socket.io")
