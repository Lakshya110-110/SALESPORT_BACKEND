"""Pagination shared by every list endpoint.

Split out from settings so the page-size rules live next to a comment
explaining why they exist.
"""
from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """PageNumberPagination that actually honours `?page_size=`.

    Plain PageNumberPagination ignores the parameter unless
    `page_size_query_param` is set — and it ignores it SILENTLY: the request
    succeeds, `count` reports the true total, and only `results` is quietly
    truncated to PAGE_SIZE. Nothing errors, so a client asking for 500 rows and
    getting 25 looks like it worked.

    That misled the whole frontend. The Meetings KPIs asked for 500 meetings to
    count from, got the first 25 (oldest-first, all of them months past), and
    rendered "Upcoming: 0" while 19 upcoming meetings sat in the database.
    Every other caller passing page_size=100 — the dashboard charts, Top
    Industries, Companies, Users — was computing from the first 25 rows too.

    `max_page_size` is the backstop: page_size is caller-controlled, so without
    a ceiling anyone could ask for the entire table in one query.
    """

    page_size_query_param = "page_size"
    max_page_size = 500
