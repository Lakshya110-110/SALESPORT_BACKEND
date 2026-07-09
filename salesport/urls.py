from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from crm import views

router = DefaultRouter()
router.register("enquiries", views.EnquiryViewSet, basename="enquiry")
router.register("companies", views.CompanyViewSet, basename="company")
router.register("contacts", views.ContactViewSet, basename="contact")
router.register("meetings", views.MeetingViewSet, basename="meeting")
router.register("proposals", views.ProposalViewSet, basename="proposal")
router.register("follow-ups", views.FollowUpViewSet, basename="followup")
router.register("users", views.UserViewSet, basename="user")
router.register("notifications", views.NotificationViewSet, basename="notification")
router.register("master-data", views.MasterDataViewSet, basename="masterdata")

urlpatterns = [
    path("admin/", admin.site.urls),

    # Auth (phone -> OTP -> JWT)
    path("api/auth/request-otp/", views.request_otp),
    path("api/auth/verify-otp/", views.verify_otp),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/auth/me/", views.me),

    # Dashboard
    path("api/dashboard/", views.dashboard),

    # Resources
    path("api/", include(router.urls)),
]

# Serve uploaded media in dev via Django. In production S3 (or nginx) serves
# these instead — driven by settings.FILE_STORAGE.
if settings.DEBUG and settings.FILE_STORAGE == "filesystem":
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
