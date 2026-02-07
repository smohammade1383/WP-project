from django.contrib import admin

from .models import (
    BioMedicalEvidence,
    BioMedicalImage,
    Evidence,
    IdentityDocumentEvidence,
    IdentityDocumentField,
    TranscriptionEvidence,
    TranscriptionMedia,
    VehicleEvidence,
)

admin.site.register(Evidence)
admin.site.register(TranscriptionEvidence)
admin.site.register(TranscriptionMedia)
admin.site.register(BioMedicalEvidence)
admin.site.register(BioMedicalImage)
admin.site.register(VehicleEvidence)
admin.site.register(IdentityDocumentEvidence)
admin.site.register(IdentityDocumentField)
