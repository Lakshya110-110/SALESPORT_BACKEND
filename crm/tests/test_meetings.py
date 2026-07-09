"""
Phase 6 — Meetings backend tests.

Covers:
  · CRUD + reschedule action + consultant scoping.
  · Outcome fields (sentiment / decision_maker_present / notes).
  · Filter params (status / mode / consultant / enquiry / date range).
  · Serializer validation (outcome only on Done meetings).
  · Notification hook fires on the Done transition.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from crm.models import (
    Company,
    Enquiry,
    Meeting,
    Notification,
    User,
)


def _make_user(phone, name, role="consultant", **extra):
    return User.objects.create_user(phone=phone, name=name, role=role, **extra)


class MeetingBaseTest(APITestCase):
    """Shared fixtures — one admin, two consultants, one company + enquiry."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("9990000000", "Owner Admin", role="admin")
        cls.consultant_a = _make_user("9991111111", "Consultant A")
        cls.consultant_b = _make_user("9992222222", "Consultant B")
        cls.company = Company.objects.create(name="Test Co", industry="Dairy")
        cls.enquiry = Enquiry.objects.create(
            company=cls.company,
            source="Website",
            expected_value=500000,
            owner=cls.consultant_a,
        )

    def as_(self, user):
        """Authenticate the DRF client as `user` via forced authentication."""
        self.client.force_authenticate(user=user)


# ---------------------------------------------------------------------------
# CRUD + reschedule
# ---------------------------------------------------------------------------
class MeetingCrudTests(MeetingBaseTest):
    def test_admin_can_create_meeting(self):
        self.as_(self.admin)
        when = timezone.now() + timedelta(days=2)
        r = self.client.post(
            "/api/meetings/",
            {
                "enquiry": self.enquiry.id,
                "company": self.company.id,
                "purpose": "Product demo",
                "mode": "Online",
                "scheduled_at": when.isoformat(),
                "consultant": self.consultant_a.id,
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)
        self.assertEqual(r.data["status"], "Scheduled")
        self.assertEqual(r.data["consultant_name"], self.consultant_a.name)

    def test_reschedule_action_updates_time_and_resets_status(self):
        self.as_(self.admin)
        m = Meeting.objects.create(
            company=self.company,
            purpose="Demo",
            scheduled_at=timezone.now() + timedelta(days=1),
            status="Cancelled",
        )
        new_when = timezone.now() + timedelta(days=5)
        r = self.client.post(
            f"/api/meetings/{m.id}/reschedule/",
            {"scheduled_at": new_when.isoformat()},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.data)
        self.assertEqual(r.data["status"], "Scheduled")

    def test_consultant_only_sees_own_meetings(self):
        Meeting.objects.create(
            enquiry=self.enquiry, company=self.company, purpose="Mine",
            scheduled_at=timezone.now() + timedelta(days=1),
            consultant=self.consultant_a,
        )
        Meeting.objects.create(
            enquiry=self.enquiry, company=self.company, purpose="Theirs",
            scheduled_at=timezone.now() + timedelta(days=1),
            consultant=self.consultant_b,
        )
        self.as_(self.consultant_a)
        r = self.client.get("/api/meetings/")
        purposes = {row["purpose"] for row in r.data["results"]}
        self.assertEqual(purposes, {"Mine"})


# ---------------------------------------------------------------------------
# Outcome fields
# ---------------------------------------------------------------------------
class MeetingOutcomeTests(MeetingBaseTest):
    def _make_scheduled(self, **extra):
        defaults = dict(
            company=self.company,
            enquiry=self.enquiry,
            purpose="Demo",
            scheduled_at=timezone.now() + timedelta(days=1),
            consultant=self.consultant_a,
        )
        defaults.update(extra)
        return Meeting.objects.create(**defaults)

    def test_mark_done_persists_outcome_fields_and_creates_notification(self):
        m = self._make_scheduled()
        self.as_(self.admin)
        r = self.client.patch(
            f"/api/meetings/{m.id}/",
            {
                "status": "Done",
                "outcome_sentiment": "Positive",
                "decision_maker_present": True,
                "outcome_notes": "Great meeting, moving to negotiation.",
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.data)
        m.refresh_from_db()
        self.assertEqual(m.status, "Done")
        self.assertEqual(m.outcome_sentiment, "Positive")
        self.assertTrue(m.decision_maker_present)
        self.assertIn("negotiation", m.outcome_notes)
        # Notification fired for admins on the Done transition.
        self.assertTrue(
            Notification.objects.filter(
                ntype="team_update", link_type="meeting", link_id=str(m.id),
            ).exists()
        )

    def test_cancelled_meeting_cannot_carry_outcome_sentiment(self):
        m = self._make_scheduled()
        self.as_(self.admin)
        r = self.client.patch(
            f"/api/meetings/{m.id}/",
            {"status": "Cancelled", "outcome_sentiment": "Positive"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("outcome_sentiment", r.data)

    def test_scheduled_meeting_cannot_preload_outcome_notes(self):
        m = self._make_scheduled()
        self.as_(self.admin)
        r = self.client.patch(
            f"/api/meetings/{m.id}/",
            {"outcome_notes": "premature notes"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
class MeetingFilterTests(MeetingBaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        now = timezone.now()
        cls.upcoming = Meeting.objects.create(
            company=cls.company, enquiry=cls.enquiry, purpose="Upcoming",
            scheduled_at=now + timedelta(days=3),
            consultant=cls.consultant_a, mode="Online", status="Scheduled",
        )
        cls.past = Meeting.objects.create(
            company=cls.company, enquiry=cls.enquiry, purpose="Past",
            scheduled_at=now - timedelta(days=3),
            consultant=cls.consultant_b, mode="In-person", status="Done",
        )

    def test_filter_by_when_upcoming(self):
        self.as_(self.admin)
        r = self.client.get("/api/meetings/?when=upcoming")
        purposes = {row["purpose"] for row in r.data["results"]}
        self.assertEqual(purposes, {"Upcoming"})

    def test_filter_by_status(self):
        self.as_(self.admin)
        r = self.client.get("/api/meetings/?status=Done")
        purposes = {row["purpose"] for row in r.data["results"]}
        self.assertEqual(purposes, {"Past"})

    def test_filter_by_mode(self):
        self.as_(self.admin)
        r = self.client.get("/api/meetings/?mode=In-person")
        purposes = {row["purpose"] for row in r.data["results"]}
        self.assertEqual(purposes, {"Past"})

    def test_filter_by_consultant(self):
        self.as_(self.admin)
        r = self.client.get(f"/api/meetings/?consultant={self.consultant_b.id}")
        purposes = {row["purpose"] for row in r.data["results"]}
        self.assertEqual(purposes, {"Past"})

    def test_filter_by_enquiry(self):
        # Both fixtures point at the same enquiry; adding an unrelated one
        # gives us a signal that the filter actually narrows.
        other_enquiry = Enquiry.objects.create(
            company=self.company, source="Referral", expected_value=100000, owner=self.admin,
        )
        Meeting.objects.create(
            company=self.company, enquiry=other_enquiry, purpose="Unrelated",
            scheduled_at=timezone.now() + timedelta(days=1),
        )
        self.as_(self.admin)
        r = self.client.get(f"/api/meetings/?enquiry={self.enquiry.id}")
        purposes = {row["purpose"] for row in r.data["results"]}
        self.assertEqual(purposes, {"Upcoming", "Past"})

    def test_filter_by_date_from(self):
        self.as_(self.admin)
        today = timezone.now().date().isoformat()
        r = self.client.get(f"/api/meetings/?date_from={today}")
        purposes = {row["purpose"] for row in r.data["results"]}
        self.assertEqual(purposes, {"Upcoming"})
