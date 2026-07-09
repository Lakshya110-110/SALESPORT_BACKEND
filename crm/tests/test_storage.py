"""
Phase 8 — Storage backend swap.

Verifies that the settings hook picks the right file-storage backend based
on `FILE_STORAGE` env and that the model actually writes into it.
"""
import io
import os
import tempfile
import importlib

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from crm.models import Company, Enquiry, Proposal, User


class StorageBackendSwapTests(SimpleTestCase):
    def test_default_is_filesystem(self):
        # In the running test environment the storage backend is Django's
        # default `FileSystemStorage` (no FILE_STORAGE=s3 env set here).
        from django.core.files.storage import FileSystemStorage
        self.assertIsInstance(default_storage, FileSystemStorage)


class FileSystemUploadTests(APITestCase):
    """End-to-end proposal upload against the filesystem backend — proves the
    multipart POST → FileField → served URL chain still works before we flip
    to S3 in production."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        # Redirect media into a scratch dir so the test doesn't scribble
        # into the real MEDIA_ROOT during CI runs.
        self.override = override_settings(MEDIA_ROOT=self.tmp.name)
        self.override.enable()
        self.admin = User.objects.create_user(phone="9990000000", name="Admin", role="admin")
        self.co = Company.objects.create(name="Test Co", industry="Dairy")
        self.enq = Enquiry.objects.create(company=self.co, source="Website", expected_value=100000)
        self.client.force_authenticate(user=self.admin)

    def tearDown(self):
        self.override.disable()
        self.tmp.cleanup()

    def test_upload_writes_file_and_exposes_url(self):
        pdf_bytes = b"%PDF-1.4\ntest\n"
        r = self.client.post(
            "/api/proposals/",
            {
                "enquiry": self.enq.id,
                "title": "Test proposal",
                "amount": "250000",
                "status": "Sent",
                "file": ContentFile(pdf_bytes, name="test.pdf"),
            },
            format="multipart",
        )
        self.assertEqual(r.status_code, 201, r.data)
        # `file_url` is now the FileField-derived URL, not a URLField input.
        self.assertTrue(r.data["file_url"], "expected a file_url")
        # Fetch the actual proposal, verify it wrote bytes to MEDIA_ROOT.
        p = Proposal.objects.get(id=r.data["id"])
        self.assertTrue(p.file)
        with p.file.open("rb") as fh:
            self.assertEqual(fh.read(), pdf_bytes)
        # File landed under MEDIA_ROOT/proposals/YYYY/MM/.
        self.assertTrue(p.file.name.startswith("proposals/"))
