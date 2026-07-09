from django.contrib import admin
from .models import (User, Company, Contact, Enquiry, Touchpoint,
                     NegotiationRound, Meeting, Proposal, Notification, MasterData)

for m in (User, Company, Contact, Enquiry, Touchpoint, NegotiationRound,
          Meeting, Proposal, Notification, MasterData):
    admin.site.register(m)
