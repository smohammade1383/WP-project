from users.permissions import HasAnyRole


class CanViewAggregatedStats(HasAnyRole):
    required_roles = (
        "Administrator",
        "Chief",
        "Captain",
        "Sergeant",
        "Detective",
        "Police Officer",
        "Patrol Officer",
        "Cadet",
    )
