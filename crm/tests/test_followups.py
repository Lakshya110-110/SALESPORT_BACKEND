"""
Phase 7 — Follow-ups + Django-Q2 task.

Covers:
  · CRUD + `complete` / `snooze` actions.
  · `due=today` / `due=overdue` filters.
  · Consultant scoping.
  · Auto-create from Touchpoint.next_action_date.
  · notify_overdue_followups scheduled task (idempotent).
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from crm.models import Company, Enquiry, FollowUp, Notification, Touchpoint, User
from crm.tasks import notify_overdue_followups


def _make_user(phone, name, role="consultant"):
    return User.objects.create_user(phone=phone, name=name, role=role)


class FollowUpBaseTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("9990000000", "Owner Admin", role="admin")
        cls.rep_a = _make_user("9991111111", "Rep A")
        cls.rep_b = _make_user("9992222222", "Rep B")
        cls.company = Company.objects.create(name="Test Co", industry="Dairy")
        cls.enq_a = Enquiry.objects.create(
            company=cls.company, source="Website", expected_value=500000, owner=cls.rep_a,
        )
        cls.enq_b = Enquiry.objects.create(
            company=cls.company, source="Referral", expected_value=250000, owner=cls.rep_b,
        )

    def as_(self, u):
        self.client.force_authenticate(user=u)


class FollowUpCrudTests(FollowUpBaseTest):
    def test_create_follow_up(self):
        self.as_(self.rep_a)
        r = self.client.post(
            "/api/follow-ups/",
            {
                "enquiry": self.enq_a.id,
                "owner": self.rep_a.id,
                "title": "Send revised quote",
                "due_at": (timezone.now() + timedelta(days=2)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)
        self.assertEqual(r.data["status"], "Pending")
        self.assertEqual(r.data["company_name"], "Test Co")

    def test_complete_action_stamps_completed_at(self):
        f = FollowUp.objects.create(
            enquiry=self.enq_a, owner=self.rep_a,
            title="Do the thing", due_at=timezone.now() + timedelta(days=1),
        )
        self.as_(self.rep_a)
        r = self.client.post(f"/api/follow-ups/{f.id}/complete/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        f.refresh_from_db()
        self.assertEqual(f.status, "Done")
        self.assertIsNotNone(f.completed_at)

    def test_snooze_requires_until_and_shifts_due(self):
        f = FollowUp.objects.create(
            enquiry=self.enq_a, owner=self.rep_a,
            title="Do the thing", due_at=timezone.now() + timedelta(days=1),
        )
        self.as_(self.rep_a)
        r = self.client.post(f"/api/follow-ups/{f.id}/snooze/")
        self.assertEqual(r.status_code, 400)
        new_due = (timezone.now() + timedelta(days=5)).isoformat()
        r = self.client.post(f"/api/follow-ups/{f.id}/snooze/", {"until": new_due}, format="json")
        self.assertEqual(r.status_code, 200)
        f.refresh_from_db()
        self.assertEqual(f.status, "Snoozed")

    def test_consultant_only_sees_own_follow_ups(self):
        FollowUp.objects.create(
            enquiry=self.enq_a, owner=self.rep_a,
            title="Mine", due_at=timezone.now() + timedelta(days=1),
        )
        FollowUp.objects.create(
            enquiry=self.enq_b, owner=self.rep_b,
            title="Theirs", due_at=timezone.now() + timedelta(days=1),
        )
        self.as_(self.rep_a)
        r = self.client.get("/api/follow-ups/")
        titles = {row["title"] for row in r.data["results"]}
        self.assertEqual(titles, {"Mine"})


class FollowUpFilterTests(FollowUpBaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        now = timezone.now()
        cls.today = FollowUp.objects.create(
            enquiry=cls.enq_a, owner=cls.rep_a, title="Today",
            due_at=now.replace(hour=15, minute=0, second=0, microsecond=0),
        )
        cls.overdue = FollowUp.objects.create(
            enquiry=cls.enq_a, owner=cls.rep_a, title="Overdue",
            due_at=now - timedelta(days=2),
        )
        cls.future = FollowUp.objects.create(
            enquiry=cls.enq_a, owner=cls.rep_a, title="Future",
            due_at=now + timedelta(days=5),
        )

    def test_due_today_filter(self):
        self.as_(self.admin)
        r = self.client.get("/api/follow-ups/?due=today")
        self.assertEqual({row["title"] for row in r.data["results"]}, {"Today"})

    def test_due_overdue_filter(self):
        self.as_(self.admin)
        r = self.client.get("/api/follow-ups/?due=overdue")
        self.assertEqual({row["title"] for row in r.data["results"]}, {"Overdue"})


class TouchpointAutoFollowUpTests(FollowUpBaseTest):
    def test_logging_a_touchpoint_with_next_action_date_creates_a_follow_up(self):
        self.as_(self.rep_a)
        due_date = (timezone.now() + timedelta(days=3)).date()
        r = self.client.post(
            f"/api/enquiries/{self.enq_a.id}/log_touchpoint/",
            {
                "channel": "Call",
                "outcome": "Ringed, no answer",
                "note": "Try again Wed.",
                "next_action": "Try again",
                "next_action_date": due_date.isoformat(),
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)
        follow_ups = FollowUp.objects.filter(enquiry=self.enq_a)
        self.assertEqual(follow_ups.count(), 1)
        f = follow_ups.first()
        self.assertEqual(f.due_at.date(), due_date)
        self.assertEqual(f.title, "Try again")
        self.assertIsNotNone(f.source_touchpoint)


class NotifyOverdueTaskTests(FollowUpBaseTest):
    def test_task_creates_one_notification_per_overdue_follow_up_and_is_idempotent(self):
        FollowUp.objects.create(
            enquiry=self.enq_a, owner=self.rep_a, title="Was due yesterday",
            due_at=timezone.now() - timedelta(days=1),
        )
        FollowUp.objects.create(
            enquiry=self.enq_a, owner=self.rep_a, title="Not due yet",
            due_at=timezone.now() + timedelta(days=1),
        )
        # First run: one notification.
        notify_overdue_followups()
        self.assertEqual(
            Notification.objects.filter(ntype="overdue", link_type="followup").count(),
            1,
        )
        # Second run inside the same day: still one — idempotent.
        notify_overdue_followups()
        self.assertEqual(
            Notification.objects.filter(ntype="overdue", link_type="followup").count(),
            1,
        )
